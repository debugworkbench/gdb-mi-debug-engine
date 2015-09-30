// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

export function getErrorDetail(err: any): string {
  if (!err) {
	  return undefined;
  }

  // TODO: handle dbgmits.CommandFailedError better
  if (typeof err === 'string') {
    return err;
  } else if (err.message) {
    return err.message;
  } else {
    return err.toString();
  }
}
