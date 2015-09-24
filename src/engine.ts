// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { IDebugConfig, IDebugSession, IDebugEngine } from 'debug-engine';
import { isGdbMiDebugConfig, IGdbMiDebugConfig } from './config';
import GdbMiDebugSession from './session';
import { startDebugSession, DebuggerType } from 'dbgmits';

export default class GdbMiDebugEngine implements IDebugEngine {
  get name(): string {
    return 'gdb-mi';
  }

  createConfig(configName: string): IDebugConfig {
    return <IGdbMiDebugConfig> {
      name: configName,
      engine: this.name
    };
  }

  cloneConfig(config: IDebugConfig): IDebugConfig {
    if (isGdbMiDebugConfig(config)) {
      return <IGdbMiDebugConfig> {
        name: config.name,
        engine: config.engine,
        debuggerType: config.debuggerType,
        debuggerPath: config.debuggerPath,
        executable: config.executable,
        executableArgs: config.executableArgs,
        targetIsRemote: config.targetIsRemote,
        host: config.host,
        port: config.port
      };
    } else {
      throw new Error(`Debug engine "${this.name}"" can't clone debug config for engine "${config.engine}".`);
    }
  }

  startDebugSession(config: IDebugConfig): Promise<IDebugSession> {
    const debugConfig = <IGdbMiDebugConfig> config;
    return Promise.resolve().then(() => {
      if (!isGdbMiDebugConfig(config)) {
        throw new Error(`Debug config "${config.name}" can't be used with engine "${config.engine}".`);
      }
      const session = new GdbMiDebugSession(debugConfig.debuggerType, debugConfig.debuggerPath);
      return session.start()
      .then(() => {
        if (debugConfig.executable) {
          return session.createInferior({ executableFile: debugConfig.executable })
          .then(() => {
            if (debugConfig.targetIsRemote) {
              return session.connectToRemoteTarget(debugConfig.host, debugConfig.port);
            }
          });
        }
      })
      .then(() => {
        return session;
      });
    });
  }
}
