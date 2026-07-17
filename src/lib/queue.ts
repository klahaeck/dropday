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

export function pauseMember(queue: string[], memberId: string): string[] {
  return queue.filter((id) => id !== memberId);
}

export function appendMember(queue: string[], memberId: string): string[] {
  return queue.includes(memberId) ? queue : [...queue, memberId];
}
