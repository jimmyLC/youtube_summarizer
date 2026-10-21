import { redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { cookiesStatus } from "@/lib/member-cookies"
import { SettingsView } from "@/components/settings-view"

export default async function Page() {
  const user = await currentUser()
  if (!user?.memberCookies) redirect("/")
  return <SettingsView user={user} initial={await cookiesStatus(user.id)} />
}
