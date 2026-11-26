export interface UpdateActions {
  /** Let the waiting version take over (it then asks for a reload). */
  activate(): void;
  reload(): void;
}

export interface UpdateGate {
  /** The owner is on Home (true) or anywhere else, such as mid-session, mid-sprint or mid-mock (false). */
  setIdle(idle: boolean): void;
  /** A new version is installed and waiting. */
  updateWaiting(): void;
  /** A new version has taken control of the page: it needs a reload to show. */
  reloadNeeded(): void;
}

/**
 * Holds a new version of the app back until the owner is on Home, so an update
 * never reloads the page in the middle of a session, sprint or mock. Otherwise it
 * simply arrives at the next launch.
 */
export function createUpdateGate(actions: UpdateActions): UpdateGate {
  let idle = false;
  let waiting = false;
  let reload = false;
  const settle = () => {
    if (!idle) return;
    if (reload) {
      reload = false;
      actions.reload();
    } else if (waiting) {
      waiting = false;
      actions.activate();
    }
  };
  return {
    setIdle(next) {
      idle = next;
      settle();
    },
    updateWaiting() {
      waiting = true;
      settle();
    },
    reloadNeeded() {
      reload = true;
      settle();
    },
  };
}
