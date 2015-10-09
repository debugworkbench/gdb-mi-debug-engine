// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import GdbMiDebugSession from './session';
import GdbMiThread from './thread';
import {
  DebugEngineError, IBreakpoint, IBreakpointLocation, IBreakpointDidStopTargetEvent,
  IAddBreakpointParams, IBreakpointFindLocationParams
} from 'debug-engine';
import { getErrorDetail } from './utils';
import * as dbgmits from 'dbgmits';
import { Emitter, CompositeDisposable, Disposable } from 'event-kit';

export class GdbMiBreakpointLocation implements IBreakpointLocation {
  private _id: string;
  private _isEnabled: boolean;
  private _address: string;
  private _func: string;
  private _relativePath: string;
  private _absolutePath: string;
  private _lineNumber: number;

  get id(): string {
    return this._id;
  }

  get isEnabled(): boolean {
    return this._isEnabled;
  }

  get address(): string {
    return this._address;
  }

  get func(): string {
    return this._func;
  }

  /** Path (inc. filename) to a source file relative to the build directory (kinda sorta maybe!) */
  get relativePath(): string {
    return this._relativePath;
  }

  /** Absolute path (inc. filename) to a source file on the build machine. */
  get absolutePath(): string {
    return this._absolutePath;
  }

  get lineNumber(): number {
    return this._lineNumber;
  }

  /** @internal */
  constructor(locationInfo: dbgmits.IBreakpointLocationInfo) {
    this._id = locationInfo.id;
    this._isEnabled = locationInfo.isEnabled;
    this._address = locationInfo.address;
    this._func = locationInfo.func;
    this._relativePath = locationInfo.filename;
    this._absolutePath = locationInfo.fullname;
    this._lineNumber = locationInfo.line;
  }

  dispose(): void {
    // nothing yet
  }
}

interface IBreakpointConstructorParams {
  session: GdbMiDebugSession;
  id: number;
  originalLocation: string;
  locations: dbgmits.IBreakpointLocationInfo[];
  isEnabled?: boolean;
  isHardware?: boolean;
  isOneShot?: boolean;
  ignoreCount?: number;
  enableCount?: number;
  hitCount?: number;
  condition?: string;
  threadId?: number;
}

const EVENT_DID_STOP_TARGET = 'did-stop-target';

export class GdbMiBreakpoint implements IBreakpoint {
  private _id: number;
  private _originalLocation: string;
  private _locations: GdbMiBreakpointLocation[];
  private _isEnabled: boolean;
  private _isHardware: boolean;
  private _isOneShot: boolean;
  private _condition: string;
  private _ignoreCount: number;
  private _enableCount: number;
  private _hitCount: number;
  private _thread: GdbMiThread;
  private _threadId: number;
  private _session: GdbMiDebugSession;
  private _dbgmitsSession: dbgmits.DebugSession;
  private _emitter = new Emitter();
  private _isDisposed = false;

  get id(): number {
    return this._id;
  }

  get isEnabled(): boolean {
    return this._isEnabled;
  }

  get isHardware(): boolean {
    return this._isHardware;
  }

  get isOneShot(): boolean {
    return this._isOneShot;
  }

  get condition(): string {
    return this._condition;
  }

  get ignoreCount(): number {
    return this._ignoreCount;
  }

  get enableCount(): number {
    return this._enableCount;
  }

  get hitCount(): number {
    return this._hitCount;
  }

  get thread(): GdbMiThread {
    if (!this._thread) {
      this._thread = this._session.getThreadById(this._threadId);
    }
    return this._thread;
  }

  get originalLocation(): string {
    return this._originalLocation;
  }

  get locations(): GdbMiBreakpointLocation[] {
    return this._locations;
  }

  /** @internal */
  constructor(params: IBreakpointConstructorParams) {
    this._session = params.session;
    this._id = params.id;
    this._originalLocation = params.originalLocation;
    this._isEnabled = params.isEnabled;
    this._isHardware = params.isHardware;
    this._isOneShot = params.isOneShot;
    this._condition = params.condition;
    this._ignoreCount = params.ignoreCount;
    this._enableCount = params.enableCount;
    this._hitCount = params.hitCount;
    this._threadId = params.threadId;
    params.locations = params.locations || [];
    this._locations = params.locations.map((location) => new GdbMiBreakpointLocation(location));

    //this._onDidChange = this._onDidChange.bind(this);
    this._onDidStopTarget = this._onDidStopTarget.bind(this);

    //this._session.inner.on(dbgmits.EVENT_BREAKPOINT_MODIFIED, this._onDidChange);
    this._session.inner.on(dbgmits.EVENT_BREAKPOINT_HIT, this._onDidStopTarget);
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._session.inner.removeListener(dbgmits.EVENT_BREAKPOINT_HIT, this._onDidStopTarget);
      this._session = null;
      this._thread = null;
      this._isDisposed = true;
    }
  }

  enable(doEnable: boolean): Promise<void> {
    return this._session.inner.enableBreakpoint(this.id)
    .catch((err) => {
      throw new DebugEngineError(
        doEnable ? 'Failed to enable breakpoint.' : 'Failed to disable breakpoint.',
        getErrorDetail(err)
      );
    });
  }

  setCondition(condition: string): Promise<void> {
    return this._session.inner.setBreakpointCondition(this.id, condition)
    .catch((err) => {
      throw new DebugEngineError('Failed to set breakpoint condition.', getErrorDetail(err));
    });
  }

  setIgnoreCount(count: number): Promise<void> {
    return this._session.inner.ignoreBreakpoint(this.id, count)
    .then((breakpointInfo) => {
      // TODO: verify the ignore count has been set correctly?
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to set breakpoint ignore count.', getErrorDetail(err));
    });
  }

  findLocation({
    address, func, relativePath, absolutePath, lineNumber
  }: IBreakpointFindLocationParams): GdbMiBreakpointLocation {
    for (let i = 0; i < this.locations.length; ++i) {
      const location = this.locations[i];
      if (address && (location.address === address)) {
        return location;
      } else if (absolutePath && (location.absolutePath === absolutePath)) {
        if ((lineNumber !== undefined) && (location.lineNumber === lineNumber)) {
          return location;
        } else if (func && (location.func === func)) {
          return location;
        }
      } else if (relativePath && (location.relativePath === relativePath)) {
        if ((lineNumber !== undefined) && (location.lineNumber === lineNumber)) {
          return location;
        } else if (func && (location.func === func)) {
          return location;
        }
      }
    }
    return null;
  }

  /** Adds an event handler that will be invoked when the breakpoint is hit. */
  onDidStopTarget(callback: (e: IBreakpointDidStopTargetEvent) => void): Disposable {
    return this._emitter.on(EVENT_DID_STOP_TARGET, callback);
  }
/*
  private _onDidChange(e: dbgmits.IBreakpointModifiedEvent): void {
    if (this.id === e.breakpointId) {
      // TODO: update counts, update enabled/disabled locations etc.
    }
  }
*/

  private _onDidStopTarget(e: dbgmits.IBreakpointHitEvent): void {
    if (this.id === e.breakpointId) {
      const location = this.findLocation({
        address: e.frame.address,
        func: e.frame.func,
        relativePath: e.frame.filename,
        absolutePath: e.frame.fullname,
        lineNumber: e.frame.line
      });
      const hitEvent: IBreakpointDidStopTargetEvent = {
        breakpoint: this,
        location,
        thread: this._session.getThreadById(e.threadId),
        stoppedThreads: e.stoppedThreads.map((threadId) => this._session.getThreadById(e.threadId)),
        processorCore: e.processorCore
      };
      this._emitter.emit(EVENT_DID_STOP_TARGET, hitEvent);
    }
  }
}

/** @internal */
export class GdbMiBreakpointManager {
  private _session: GdbMiDebugSession;
  private _dbgmitsSession: dbgmits.DebugSession;
  private _breakpoints: GdbMiBreakpoint[] = [];
  private _emitter = new Emitter();
  private _subscriptions = new CompositeDisposable();
  private _isDisposed = false;

  constructor(session: GdbMiDebugSession) {
    this._session = session;
    this._onBreakpointDidStopTarget = this._onBreakpointDidStopTarget.bind(this);
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._breakpoints.forEach((breakpoint) => {
        breakpoint.dispose();
      });
      this._emitter.dispose();
      this._subscriptions.dispose();
      this._breakpoints = null;
      this._session = null;
      this._isDisposed = true;
    }
  }

  addBreakpoint({
    location, isEnabled = true, isPending = true, isHardware = false, isOneShot = false,
    ignoreCount = 0, condition, thread
  }: IAddBreakpointParams): Promise<GdbMiBreakpoint> {
    return this._session.inner.addBreakpoint(location, {
      isTemp: isOneShot, isHardware, isPending, isDisabled: !isEnabled, ignoreCount, condition,
      threadId: thread.id
    })
    .then((breakpointInfo) => {
      const breakpoint = new GdbMiBreakpoint({
        session: this._session,
        id: breakpointInfo.id,
        originalLocation: breakpointInfo.originalLocation,
        locations: breakpointInfo.locations,
        isEnabled: breakpointInfo.isEnabled,
        isHardware,
        isOneShot: breakpointInfo.isTemp,
        ignoreCount: breakpointInfo.ignoreCount,
        enableCount: breakpointInfo.enableCount,
        condition: breakpointInfo.condition,
        threadId: breakpointInfo.threadId
      });
      this._subscriptions.add(breakpoint.onDidStopTarget(this._onBreakpointDidStopTarget));
      this._breakpoints.push(breakpoint);
      return breakpoint;
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to add breakpoint.', getErrorDetail(err));
    });
  }

  removeBreakpoint(breakpoint: GdbMiBreakpoint): Promise<void> {
    return this._session.inner.removeBreakpoint(breakpoint.id)
    .then(() => {
      this._breakpoints.splice(this._breakpoints.indexOf(breakpoint));
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to remove breakpoint.', getErrorDetail(err));
    });
  }

  removeBreakpoints(breakpoints: GdbMiBreakpoint[]): Promise<void> {
    return Promise.resolve().then(() => {
      const breakpointIds = breakpoints.map((breakpoint) => breakpoint.id);
      return this._session.inner.removeBreakpoints(breakpointIds)
      .then(() => {
        this._breakpoints = this._breakpoints.filter((breakpoint) => {
          return breakpointIds.indexOf(breakpoint.id) === -1;
        });
      });
    })
    .catch((err) => {
      throw new DebugEngineError('Failed to remove breakpoints.', getErrorDetail(err));
    });
  }

  enableBreakpoints(breakpoints: GdbMiBreakpoint[], doEnable: boolean): Promise<void> {
    return Promise.resolve()
    .then(() => breakpoints.map((breakpoint) => breakpoint.id))
    .then((breakpointIds) => {
      if (doEnable) {
        return this._session.inner.enableBreakpoints(breakpointIds);
      } else {
        return this._session.inner.disableBreakpoints(breakpointIds);
      }
    })
    .catch((err) => {
      throw new DebugEngineError(
        doEnable ? 'Failed to enable breakpoints.' : 'Failed to disable breakpoints.',
        getErrorDetail(err)
      );
    });
  }

  /** Adds an event handler that will be invoked when a breakpoint is hit. */
  onBreakpointDidStopTarget(callback: (e: IBreakpointDidStopTargetEvent) => void): Disposable {
    return this._emitter.on(EVENT_DID_STOP_TARGET, callback);
  }

  private _onBreakpointDidStopTarget(e: IBreakpointDidStopTargetEvent): void {
    this._emitter.emit(EVENT_DID_STOP_TARGET, e);
  }
}
