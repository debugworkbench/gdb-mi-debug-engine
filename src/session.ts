// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import {
  IDebugSession, IInferior, ICreateInferiorOptions, IBreakpointDidStopTargetEvent,
  IAddBreakpointParams, DebugEngineError, ConnectionError
} from 'debug-engine';
import * as dbgmits from 'dbgmits';
import GdbMiInferior from './inferior';
import GdbMiThread from './thread';
import { GdbMiBreakpoint, GdbMiBreakpointManager } from './breakpoint';
import { DebuggerType } from './config';
import { getErrorDetail } from './utils';
import { Disposable } from 'event-kit';

export default class GdbMiDebugSession implements IDebugSession {
  private _session: dbgmits.DebugSession;
  private _inferiors: GdbMiInferior[];
  private _breakpoints: GdbMiBreakpointManager;
  private _isDisposed = false;

  get inferior(): IInferior {
    if (this._inferiors.length > 0) {
      return this._inferiors[0];
    } else {
      throw new Error('No inferiors exist.');
    }
  }

  /** @internal */
  get inner(): dbgmits.DebugSession {
    return this._session;
  }

  /** @internal */
  constructor(private debuggerType: DebuggerType, private debuggerPath?: string) {
    this._inferiors = [];
  }

  /**
   * Disposes of any references held by this object, this should only be called when the object
   * is no longer needed. All inferiors, threads, and breakpoints in this session will be disposed.
   *
   * There's no need to call this method explicitely if [[end]] is called successfully.
   */
  dispose(): void {
    if (!this._isDisposed) {
      if (this._breakpoints) {
        this._breakpoints.dispose();
        this._breakpoints = null;
      }

      this._inferiors.forEach((inferior) => { inferior.dispose(); });
      this._inferiors = [];

      if (this._session) {
        this._session = null;
      }

      this._isDisposed = true;
    }
  }

  start(): Promise<void> {
    return Promise.resolve().then(() => {
      const debuggerType = (this.debuggerType === DebuggerType.LLDB) ?
          dbgmits.DebuggerType.LLDB : dbgmits.DebuggerType.GDB;
      this._session = dbgmits.startDebugSession(debuggerType, this.debuggerPath);
      this._breakpoints = new GdbMiBreakpointManager(this);
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to start debug session.', getErrorDetail(err));
    });
  }

  createInferior(options?: ICreateInferiorOptions): Promise<IInferior> {
    options = options || {};
    return Promise.resolve().then(() => {
      if (options.executableFile) {
        return this._session.setExecutableFile(options.executableFile)
        .then(() => {
          const inferior = new GdbMiInferior(this._session);
          this._inferiors.push(inferior);
          return inferior;
        });
      }
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to create inferior.', getErrorDetail(err));
    });
  }

  connectToRemoteTarget(host: string, port: number): Promise<void> {
    return this._session.connectToRemoteTarget(host, port)
    .catch((err) => {
      throw new ConnectionError(`Failed to connect to ${host}:${port}`, getErrorDetail(err));
    });
  }

  end(): Promise<void> {
    return this._session.end()
    .then(() => {
      this.dispose();
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to end debug session.', getErrorDetail(err));
    });
  }

  getThreadById(threadId: number): GdbMiThread {
    for (let i = 0; i < this._inferiors.length; ++i) {
      const thread = this._inferiors[i].getThreadById(threadId);
      if (thread) {
        return thread;
      }
    }
    return null;
  }

  addBreakpoint(params: IAddBreakpointParams): Promise<GdbMiBreakpoint> {
    return this._breakpoints.addBreakpoint(params);
  }

  removeBreakpoint(breakpoint: GdbMiBreakpoint): Promise<void> {
    return this._breakpoints.removeBreakpoint(breakpoint);
  }

  removeBreakpoints(breakpoints: GdbMiBreakpoint[]): Promise<void> {
    return this._breakpoints.removeBreakpoints(breakpoints);
  }

  enableBreakpoints(breakpoints: GdbMiBreakpoint[], doEnable: boolean): Promise<void> {
    return this._breakpoints.enableBreakpoints(breakpoints, doEnable);
  }

  onBreakpointDidStopTarget(callback: (e: IBreakpointDidStopTargetEvent) => void): Disposable {
    return this._breakpoints.onBreakpointDidStopTarget(callback);
  }
}
