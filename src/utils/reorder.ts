export function reorderByKey<TItem>(
  items: TItem[],
  draggedKey: string,
  targetKey: string,
  getKey: (item: TItem) => string,
): TItem[] {
  if (draggedKey === targetKey)
    return items

  const fromIndex = items.findIndex((item) => getKey(item) === draggedKey)
  const toIndex = items.findIndex((item) => getKey(item) === targetKey)

  if (fromIndex === -1 || toIndex === -1)
    return items

  const nextItems = [...items]
  const [draggedItem] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, draggedItem)
  return nextItems
}
