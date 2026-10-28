import { redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { usageOf } from "@/lib/plans"
import { AccountView } from "@/components/account-view"

export default async function Page() {
  const user = await currentUser()
  if (!user) redirect("/")
  return <AccountView user={user} usage={await usageOf(user.id)} />
}
