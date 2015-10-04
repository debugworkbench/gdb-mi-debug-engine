// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import {
  IDebugSession, IInferior, ICreateInferiorOptions, DebugEngineError, ConnectionError
} from 'debug-engine';
import * as dbgmits from 'dbgmits';
import GdbMiInferior from './inferior';
import { DebuggerType } from './config';
import { getErrorDetail } from './utils';

export default class GdbMiDebugSession implements IDebugSession {
  private _session: dbgmits.DebugSession;
  private _inferiors: GdbMiInferior[];
  private _isDisposed = false;

  get inferior(): IInferior {
    if (this._inferiors.length > 0) {
      return this._inferiors[0];
    } else {
      throw new Error('No inferiors exist.');
    }
  }

  /** @internal */
  constructor(private debuggerType: DebuggerType, private debuggerPath?: string) {
    this._inferiors = [];
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._inferiors.forEach((inferior) => { inferior.dispose(); });
      this._inferiors = [];

      this._isDisposed = true;
    }
  }

  start(): Promise<void> {
    return Promise.resolve().then(() => {
      const debuggerType = (this.debuggerType === DebuggerType.LLDB) ?
          dbgmits.DebuggerType.LLDB : dbgmits.DebuggerType.GDB;
      this._session = dbgmits.startDebugSession(debuggerType, this.debuggerPath);
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
    .catch((err) => {
      throw new DebugEngineError('Failed to end debug session.', getErrorDetail(err));
    });
  }
}
