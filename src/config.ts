// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { IDebugConfig } from 'debug-engine';

export enum DebuggerType {
  GDB,
  LLDB
}

export interface IGdbMiDebugConfig extends IDebugConfig {
  debuggerType?: DebuggerType;
  debuggerPath?: string;
  executable?: string;
  executableArgs?: string;
  targetIsRemote?: boolean;
  host?: string;
  port?: number;
}

// custom type guard function for IGdbMiDebugConfig
export function isGdbMiDebugConfig(config: IDebugConfig): config is IGdbMiDebugConfig {
  return config.engine === 'gdb-mi';
}
