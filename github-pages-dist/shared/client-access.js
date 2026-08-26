export const CLIENT_JOB_MANAGER_ROLES = Object.freeze(["owner", "admin", "hiring_manager"]);
export const CLIENT_RECRUITING_ROLES = Object.freeze([...CLIENT_JOB_MANAGER_ROLES, "recruiter"]);

export function clientCanManageJobs(access) {
  return Boolean(access && (!access.companyId || CLIENT_JOB_MANAGER_ROLES.includes(access.companyRole)));
}

export function clientCanRecruit(access) {
  return Boolean(access && (!access.companyId || CLIENT_RECRUITING_ROLES.includes(access.companyRole)));
}

export async function loadClientCompanyAccess(supabase, userId) {
  const profileResult = await supabase
    .from("client_profiles")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const companyId = profileResult.data?.company_id || null;
  if (!companyId) {
    return {
      companyId: null,
      companyRole: "owner",
      membershipStatus: "active",
      canViewCompanyJobs: true,
      canManageJobs: true,
      canRecruit: true,
    };
  }

  const [companyResult, membershipResult] = await Promise.all([
    supabase.from("companies").select("owner_user_id").eq("id", companyId).maybeSingle(),
    supabase.from("company_members").select("role,status").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
  ]);
  if (companyResult.error) throw companyResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const isOwner = companyResult.data?.owner_user_id === userId;
  const membershipStatus = isOwner ? "active" : membershipResult.data?.status || null;
  const companyRole = isOwner
    ? "owner"
    : membershipStatus === "active"
      ? membershipResult.data?.role || null
      : null;
  const access = { companyId, companyRole, membershipStatus };

  return {
    ...access,
    canViewCompanyJobs: Boolean(companyRole),
    canManageJobs: clientCanManageJobs(access),
    canRecruit: clientCanRecruit(access),
  };
}

export function scopeClientJobs(query, userId, access) {
  if (access?.companyId && access.canViewCompanyJobs) {
    return query.or(`client_user_id.eq.${userId},company_id.eq.${access.companyId}`);
  }
  return query.eq("client_user_id", userId);
}
