import { getSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { STAFF_ROLES } from "@/lib/guards";
import { NavBarClient } from "@/components/layout/NavBarClient";

export async function NavBar() {
  const session = await getSession();
  const isStaff = session ? STAFF_ROLES.includes(session.role) : false;

  return (
    <NavBarClient
      session={session ? { name: session.name } : null}
      isStaff={isStaff}
      logoutAction={logoutAction}
    />
  );
}
