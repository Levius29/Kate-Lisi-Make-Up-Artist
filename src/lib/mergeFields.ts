export const mergeFieldNames = [
  'firstName',
  'serviceName',
  'dateLong',
  'startTime',
  'location',
  'balanceDue',
  'cancellationDate',
] as const

export type MergeFieldName = (typeof mergeFieldNames)[number]
export type MergeFieldValues = Record<MergeFieldName, string>

const knownMergeFields = new Set<string>(mergeFieldNames)
const mergeFieldPattern = /\{([^{}]+)\}/g

export function substituteMergeFields(
  template: string,
  values: MergeFieldValues,
): string {
  return template.replace(mergeFieldPattern, (token, name: string) =>
    knownMergeFields.has(name) ? values[name as MergeFieldName] : token,
  )
}

export function findUnknownMergeFields(template: string): string[] {
  const unknown = new Set<string>()

  for (const match of template.matchAll(mergeFieldPattern)) {
    const name = match[1]
    if (name !== undefined && !knownMergeFields.has(name)) unknown.add(name)
  }

  return [...unknown]
}
