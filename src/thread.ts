// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import {
  IThread, IThreadDidResumeEvent, IThreadDidStopEvent, IThreadDidExitEvent
} from 'debug-engine';
import GdbMiInferior from './inferior';
import * as dbgmits from 'dbgmits';
import { Emitter, Disposable } from 'event-kit';

const EVENT_DID_RESUME = 'did-resume';
const EVENT_DID_STOP = 'did-stop';
const EVENT_DID_EXIT = 'did-exit';

export default class GdbMiThread implements IThread {
  private _session: dbgmits.DebugSession;
  private _id: number;
  private _inferior: GdbMiInferior;
  private _emitter: Emitter;

  get id(): number {
    return this._id;
  }

  get inferior(): GdbMiInferior {
    return this._inferior;
  }

  /** @internal */
  constructor(session: dbgmits.DebugSession, id: number, inferior: GdbMiInferior) {
    this._session = session;
	  this._id = id;
    this._inferior = inferior;
    this._emitter = new Emitter();

    this._onTargetDidResume = this._onTargetDidResume.bind(this);
    this._onTargetDidStop = this._onTargetDidStop.bind(this);
    this._onThreadDidExit = this._onThreadDidExit.bind(this);

    this._session.on(dbgmits.EVENT_TARGET_RUNNING, this._onTargetDidResume);
    this._session.on(dbgmits.EVENT_TARGET_STOPPED, this._onTargetDidStop);
    this._session.on(dbgmits.EVENT_THREAD_EXITED, this._onThreadDidExit);
  }

  onDidResume(callback: (e: IThreadDidResumeEvent) => void): Disposable {
    return this._emitter.on(EVENT_DID_RESUME, callback);
  }

  onDidStop(callback: (e: IThreadDidStopEvent) => void): Disposable {
    return this._emitter.on(EVENT_DID_STOP, callback);
  }

  onDidExit(callback: (e: IThreadDidExitEvent) => void): Disposable {
    return this._emitter.on(EVENT_DID_EXIT, callback);
  }

  private _onTargetDidResume(threadId: string): void {
    if ((threadId === 'all') || (this._id === Number(threadId))) {
      this._emitter.emit(EVENT_DID_RESUME, <IThreadDidResumeEvent> { thread: this });
    }
  }

  private _onTargetDidStop(e: dbgmits.ITargetStoppedEvent): void {
    const thisThreadStopped = (this._id === e.threadId)
                            || (e.stoppedThreads.length === 0)
                            || (e.stoppedThreads.indexOf(this._id) !== -1);
    if (thisThreadStopped) {
      this._emitter.emit(EVENT_DID_STOP, <IThreadDidStopEvent> { thread: this });
    }
  }

  private _onThreadDidExit(e: dbgmits.IThreadExitedEvent): void {
    if (this._id === e.id) {
      this._emitter.emit(EVENT_DID_EXIT, <IThreadDidExitEvent> { thread: this });
    }
  }
}
