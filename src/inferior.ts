// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { Emitter, Disposable } from 'event-kit';
import {
  IInferior, IInferiorDidExitEvent, InferiorExitReason, IInferiorStartOptions, DebugEngineError
} from 'debug-engine';
import * as dbgmits from 'dbgmits';
import { getErrorDetail } from './utils';

const EVENT_INFERIOR_DID_EXIT = 'infexit';

export default class GdbMiInferior implements IInferior {
  private emitter: Emitter;
  private exitCode: string;
  private _id: string;
  private _started: boolean = false;
  private _exited: boolean = false;
  private _pid: string;

  get id(): string {
    return this._id;
  }

  get started(): boolean {
    return this._started;
  }

  get exited(): boolean {
    return this._exited;
  }

  get pid(): string {
    return this._pid;
  }

  /** @internal */
  constructor(private session: dbgmits.DebugSession, id?: string) {
    this._id = id;
    this.emitter = new Emitter();

    this.onThreadGroupDidStart = this.onThreadGroupDidStart.bind(this);
    this.onThreadGroupDidExit = this.onThreadGroupDidExit.bind(this);
    this.onTargetDidStop = this.onTargetDidStop.bind(this);

    this.session.on(dbgmits.EVENT_THREAD_GROUP_STARTED, this.onThreadGroupDidStart);
    this.session.on(dbgmits.EVENT_THREAD_GROUP_EXITED, this.onThreadGroupDidExit);
    this.session.on(dbgmits.EVENT_TARGET_STOPPED, this.onTargetDidStop);
  }

  start(options?: IInferiorStartOptions): Promise<void> {
    options = options || {};
    return Promise.resolve().then(() => {
      if (options.cmdlineArgs) {
        return this.session.setInferiorArguments(options.cmdlineArgs);
      }
    })
    .then(() => this.session.startInferior({ stopAtStart: options.stopAtStart }))
    .catch((err) => {
      throw new DebugEngineError('Failed to start inferior.', getErrorDetail(err));
    });
  }

  abort(): Promise<void> {
    return this.session.abortInferior()
    .catch((err) => {
      throw new DebugEngineError('Failed to abort inferior.', getErrorDetail(err));
    });
  }

  interrupt(): Promise<void> {
    return this.session.interruptInferior(this.id)
    .catch((err) => {
      throw new DebugEngineError('Failed to interrupt inferior.', getErrorDetail(err));
    });
  }

  resume(): Promise<void> {
    return this.session.resumeInferior({ threadGroup: this.id })
    .catch((err) => {
      throw new DebugEngineError('Failed to resume inferior.', getErrorDetail(err));
    });
  }

  /**
   * Adds an event handler that will be invoked when an inferior exits.
   */
  onDidExit(callback: (e: IInferiorDidExitEvent) => void): Disposable {
    return this.emitter.on(EVENT_INFERIOR_DID_EXIT, callback);
  }

  private onThreadGroupDidStart(e: dbgmits.IThreadGroupStartedEvent): void {
    if (this._id === undefined) {
      this._id = e.id;
    }

    if (this._id === e.id) {
      this._started = true;
      this._pid = e.pid;
    }
  }

  private onThreadGroupDidExit(e: dbgmits.IThreadGroupExitedEvent): void {
    if (this._id === e.id) {
      this.exitCode = e.exitCode;
      this.exited = true;
    }
  }

  private onTargetDidStop(e: dbgmits.ITargetStoppedEvent): void {
    let exitReason: InferiorExitReason;
    switch (e.reason) {
      case dbgmits.TargetStopReason.Exited:
        exitReason = InferiorExitReason.Other;
        break;

      case dbgmits.TargetStopReason.ExitedNormally:
        exitReason = InferiorExitReason.Finished;
        break;

      case dbgmits.TargetStopReason.ExitedSignalled:
        exitReason = InferiorExitReason.Signalled;
        break;
    }

    if (exitReason !== undefined) {
      this.emitter.emit(EVENT_INFERIOR_DID_EXIT, <IInferiorDidExitEvent> {
        inferior: this,
        reason: exitReason,
        exitCode: this.exitCode
      });
    }
  }
}
