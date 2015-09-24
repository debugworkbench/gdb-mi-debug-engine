// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { IDebugSession, IInferior, ICreateInferiorOptions } from 'debug-engine';
import * as dbgmits from 'dbgmits';
import GdbMiInferior from './inferior';
import { DebuggerType } from './config';

export default class GdbMiDebugSession implements IDebugSession {
  private session: dbgmits.DebugSession;
  private inferiors: GdbMiInferior[];

  get inferior(): IInferior {
    if (this.inferiors.length > 0) {
      return this.inferiors[0];
    } else {
      throw new Error('No inferiors exist.');
    }
  }

  /** @internal */
  constructor(private debuggerType: DebuggerType, private debuggerPath?: string) {
    this.inferiors = [];
  }

  start(): Promise<void> {
    return Promise.resolve().then(() => {
      const debuggerType = (this.debuggerType === DebuggerType.LLDB) ?
          dbgmits.DebuggerType.LLDB : dbgmits.DebuggerType.GDB;
      this.session = dbgmits.startDebugSession(debuggerType, this.debuggerPath);
    });
  }

  createInferior(options?: ICreateInferiorOptions): Promise<IInferior> {
    options = options || {};
    return Promise.resolve().then(() => {
      if (options.executableFile) {
        return this.session.setExecutableFile(options.executableFile)
        .then(() => {
          const inferior = new GdbMiInferior(this.session);
          this.inferiors.push(inferior);
          return inferior;
        });
      }
    });
  }

  connectToRemoteTarget(host: string, port: number): Promise<void> {
    return this.session.connectToRemoteTarget(host, port);
  }

  end(): Promise<void> {
    return this.session.end();
  }
}
