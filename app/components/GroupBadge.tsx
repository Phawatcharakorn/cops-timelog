import { studentGroup, GROUP_BADGE_STYLES } from '@/lib/studentGroup'

export default function GroupBadge({ department }: { department: string }) {
  const group = studentGroup(department)
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wide flex-shrink-0 ${GROUP_BADGE_STYLES[group]}`}>
      {group}
    </span>
  )
}
