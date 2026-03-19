import { useEffect, useState } from "react";
import { getOrganization } from "@/lib/api";

/**
 * Hook that checks whether the current user belongs to an organisation.
 * Returns { orgChecked, hasOrg }.
 * 
 * If hasOrg is false after orgChecked, the consuming component should
 * block the action and redirect the user to set up their org.
 */
export function useOrgGuard() {
    const [orgChecked, setOrgChecked] = useState(false);
    const [hasOrg, setHasOrg] = useState(false);

    useEffect(() => {
        async function check() {
            try {
                const data = await getOrganization();
                // If the server returned HTTP 200-299, user is in an org
                setHasOrg(data.ok === true);
            } catch {
                setHasOrg(false);
            } finally {
                setOrgChecked(true);
            }
        }
        check();
    }, []);

    return { orgChecked, hasOrg };
}
