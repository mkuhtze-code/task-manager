import { executeTaskAction, type TaskActionExecutor } from './taskActions';
import { executeListAction, type ListActionExecutor } from './listActions';
import { executeJobAction, type JobActionExecutor } from './jobActions';
import { executeMeetingAction, type MeetingActionExecutor } from './meetingActions';
import { executeTravelAction, type TravelActionExecutor } from './travelActions';
import type { ActionExecutionResult, UniversalAction } from './types';

export type UniversalActionExecutors = {
  tasks?: TaskActionExecutor;
  lists?: ListActionExecutor;
  jobs?: JobActionExecutor;
  meetings?: MeetingActionExecutor;
  travel?: TravelActionExecutor;
  navigate?: (surface: string) => Promise<void> | void;
};

type ActionDomain = 'tasks' | 'lists' | 'jobs' | 'meetings' | 'travel';

function domain(a: UniversalAction): ActionDomain | null {
  switch (a.kind) {
    case 'create_task':
    case 'update_task':
    case 'complete_task':
    case 'move_task':
    case 'delete_task':
      return 'tasks';
    case 'create_list':
    case 'append_list_item':
    case 'update_list_item':
    case 'complete_list_item':
      return 'lists';
    case 'create_job':
    case 'update_job':
    case 'attach_to_job':
      return 'jobs';
    case 'create_meeting':
    case 'update_meeting':
    case 'attach_to_meeting':
      return 'meetings';
    case 'create_travel_activity':
    case 'update_travel_activity':
    case 'attach_to_trip':
      return 'travel';
    case 'suggest':
    case 'ask':
    case 'answer':
    case 'defer':
    case 'navigate':
    case 'noop':
      return null;
  }
  return null;
}

export async function dispatchUniversalAction(
  a: UniversalAction,
  x: UniversalActionExecutors = {},
): Promise<ActionExecutionResult> {
  try {
    switch (a.kind) {
      case 'suggest':
      case 'ask':
      case 'answer':
      case 'defer':
      case 'noop':
        return { status: 'presented', action: a, message: a.message };
      case 'navigate':
        if (!x.navigate) return { status: 'unsupported', action: a, message: 'Navigation executor is not registered.' };
        await x.navigate(a.surface);
        return { status: 'executed', action: a, message: `Navigated to ${a.surface}.` };
      default: {
        const d = domain(a);
        if (!d) return { status: 'unsupported', action: a, message: `No executor for action ${a.kind}.` };
        const executor = x[d];
        if (!executor) return { status: 'unsupported', action: a, message: `No ${d} action executor is registered.` };
        let entityId: string | null = null;
        if (d === 'tasks') entityId = await executeTaskAction(a, executor as TaskActionExecutor);
        else if (d === 'lists') entityId = await executeListAction(a, executor as ListActionExecutor);
        else if (d === 'jobs') entityId = await executeJobAction(a, executor as JobActionExecutor);
        else if (d === 'meetings') entityId = await executeMeetingAction(a, executor as MeetingActionExecutor);
        else entityId = await executeTravelAction(a, executor as TravelActionExecutor);
        return { status: 'executed', action: a, message: `Executed ${a.kind}.`, entityId };
      }
    }
  } catch (error) {
    return { status: 'failed', action: a, message: `Could not execute ${a.kind}.`, error };
  }
}
