// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { Emitter, Disposable } from 'event-kit';
import {
  IInferior, IInferiorDidCreateThreadEvent, IInferiorDidExitEvent, InferiorExitReason,
  IInferiorStartOptions, DebugEngineError
} from 'debug-engine';
import * as dbgmits from 'dbgmits';
import { getErrorDetail } from './utils';
import GdbMiThread from './thread';

const EVENT_INFERIOR_DID_CREATE_THREAD = 'did-create-thread';
const EVENT_INFERIOR_DID_EXIT = 'infexit';

export default class GdbMiInferior implements IInferior {
  private _session: dbgmits.DebugSession;
  private _emitter: Emitter;
  private _exitCode: string;
  private _id: string;
  private _started = false;
  private _exited = false;
  private _pid: string;
  private _threads: GdbMiThread[] = [];
  private _isDisposed = false;

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
  constructor(session: dbgmits.DebugSession, id?: string) {
    this._session = session;
    this._id = id;
    this._emitter = new Emitter();

    this._onThreadGroupDidStart = this._onThreadGroupDidStart.bind(this);
    this._onThreadGroupDidExit = this._onThreadGroupDidExit.bind(this);
    this._onTargetDidStop = this._onTargetDidStop.bind(this);
    this._onDidCreateThread = this._onDidCreateThread.bind(this);

    this._session.on(dbgmits.EVENT_THREAD_GROUP_STARTED, this._onThreadGroupDidStart);
    this._session.on(dbgmits.EVENT_THREAD_GROUP_EXITED, this._onThreadGroupDidExit);
    this._session.on(dbgmits.EVENT_TARGET_STOPPED, this._onTargetDidStop);
    this._session.on(dbgmits.EVENT_THREAD_CREATED, this._onDidCreateThread);
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._session.removeListener(dbgmits.EVENT_THREAD_GROUP_STARTED, this._onThreadGroupDidStart);
      this._session.removeListener(dbgmits.EVENT_THREAD_GROUP_EXITED, this._onThreadGroupDidExit);
      this._session.removeListener(dbgmits.EVENT_TARGET_STOPPED, this._onTargetDidStop);
      this._session.removeListener(dbgmits.EVENT_THREAD_CREATED, this._onDidCreateThread);

      this._emitter.dispose();
      this._threads.forEach((thread) => { thread.dispose(); });
      this._threads = [];
      this._session = null;

      this._isDisposed = true;
    }
  }

  start(options?: IInferiorStartOptions): Promise<void> {
    options = options || {};
    return Promise.resolve().then(() => {
      if (options.cmdlineArgs) {
        return this._session.setInferiorArguments(options.cmdlineArgs);
      }
    })
    .then(() => this._session.startInferior({ stopAtStart: options.stopAtStart }))
    .catch((err) => {
      throw new DebugEngineError('Failed to start inferior.', getErrorDetail(err));
    });
  }

  abort(): Promise<void> {
    return this._session.abortInferior()
    .catch((err) => {
      throw new DebugEngineError('Failed to abort inferior.', getErrorDetail(err));
    });
  }

  interrupt(): Promise<void> {
    return this._session.interruptInferior(this.id)
    .catch((err) => {
      throw new DebugEngineError('Failed to interrupt inferior.', getErrorDetail(err));
    });
  }

  resume(): Promise<void> {
    return this._session.resumeInferior({ threadGroup: this.id })
    .catch((err) => {
      throw new DebugEngineError('Failed to resume inferior.', getErrorDetail(err));
    });
  }

  onDidCreateThread(callback: (e: IInferiorDidCreateThreadEvent) => void): Disposable {
    return this._emitter.on(EVENT_INFERIOR_DID_CREATE_THREAD, callback);
  }

  onDidExit(callback: (e: IInferiorDidExitEvent) => void): Disposable {
    return this._emitter.on(EVENT_INFERIOR_DID_EXIT, callback);
  }

  private _onThreadGroupDidStart(e: dbgmits.IThreadGroupStartedEvent): void {
    if (this._id === undefined) {
      this._id = e.id;
    }

    if (this._id === e.id) {
      this._started = true;
      this._pid = e.pid;
    }
  }

  private _onThreadGroupDidExit(e: dbgmits.IThreadGroupExitedEvent): void {
    if (this._id === e.id) {
      this._exitCode = e.exitCode;
      this.exited = true;
    }
  }

  private _onTargetDidStop(e: dbgmits.ITargetStoppedEvent): void {
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
      this._emitter.emit(EVENT_INFERIOR_DID_EXIT, <IInferiorDidExitEvent> {
        inferior: this,
        reason: exitReason,
        exitCode: this._exitCode
      });
    }
  }

  private _onDidCreateThread(e: dbgmits.IThreadCreatedEvent): void {
    if (this._id === e.groupId) {
      const newThread = new GdbMiThread(this._session, e.id, this);
      this._threads.push(newThread);
      this._emitter.emit(EVENT_INFERIOR_DID_CREATE_THREAD, <IInferiorDidCreateThreadEvent> {
        inferior: this,
        thread: newThread
      });
    }
  }
}
