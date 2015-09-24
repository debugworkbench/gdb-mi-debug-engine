// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { IDebugEngineProvider, IDebugEngine } from 'debug-engine';
import GdbMiDebugEngine from './engine';

export default class GdbMiDebugEngineProvider implements IDebugEngineProvider {
  get engineName(): string {
    return 'gdb-mi';
  }

  createEngine(): IDebugEngine {
    return new GdbMiDebugEngine();
  }
}
