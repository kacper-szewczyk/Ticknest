import { useEffect, useState } from 'react'
import { subscribeToLeaveRequests } from './lib/timeOff'

/**
 * How many pending leave requests the signed-in owner or manager can decide: everyone's but their own.
 * Pass no workspace ID for members or when time off is off; the count is then 0 and nothing is read.
 */
export function usePendingLeaveCount(workspaceId: string | undefined, userId: string): number {
  // Tagged with its workspace, so switching workspaces never shows the previous one's count.
  const [counted, setCounted] = useState<{ workspaceId: string; count: number } | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    return subscribeToLeaveRequests(
      workspaceId,
      { status: 'pending' },
      (requests) => setCounted({ workspaceId, count: requests.filter((request) => request.uid !== userId).length }),
      // The badge is a hint; the approvals page shows any read error itself.
      () => setCounted({ workspaceId, count: 0 }),
    )
  }, [workspaceId, userId])
  return workspaceId && counted?.workspaceId === workspaceId ? counted.count : 0
}
