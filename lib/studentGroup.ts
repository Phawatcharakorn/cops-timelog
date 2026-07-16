// COPS vs SA is not a stored column — it's derived from department, since
// 'Student Assistant' is the only department that isn't part of CoPs
// Marketing. Kept in one place so the roster, dev/manager overview tables,
// print-roster, and export-members all agree on the same classification.
export const SA_DEPARTMENT = 'Student Assistant'

export type StudentGroup = 'COPS' | 'SA'

export function studentGroup(department: string): StudentGroup {
  return department === SA_DEPARTMENT ? 'SA' : 'COPS'
}

export const GROUP_BADGE_STYLES: Record<StudentGroup, string> = {
  COPS: 'bg-indigo-600 text-white',
  SA:   'bg-emerald-600 text-white',
}
