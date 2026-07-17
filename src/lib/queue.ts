export function rotateQueue(queue: string[], assignedUserId: string): string[] {
  const withoutAssigned = queue.filter((id) => id !== assignedUserId);
  return queue.includes(assignedUserId)
    ? [...withoutAssigned, assignedUserId]
    : [...queue];
}

export function preserveTurn(queue: string[], assignedUserId: string): string[] {
  return queue.includes(assignedUserId)
    ? [assignedUserId, ...queue.filter((id) => id !== assignedUserId)]
    : [...queue];
}

export function nextActiveMember(queue: string[], pausedMemberIds: Iterable<string>): string | undefined {
  const pausedMembers = new Set(pausedMemberIds);
  return queue.find((memberId) => !pausedMembers.has(memberId));
}

export function moveMember(queue: string[], memberId: string, targetMemberId: string): string[] {
  const fromIndex = queue.indexOf(memberId);
  const targetIndex = queue.indexOf(targetMemberId);
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return [...queue];

  const nextQueue = [...queue];
  nextQueue.splice(fromIndex, 1);
  nextQueue.splice(targetIndex, 0, memberId);
  return nextQueue;
}

export function hasSameMembers(queue: string[], candidate: string[]): boolean {
  if (queue.length !== candidate.length || new Set(candidate).size !== candidate.length) return false;
  const currentMembers = new Set(queue);
  return candidate.every((memberId) => currentMembers.has(memberId));
}
