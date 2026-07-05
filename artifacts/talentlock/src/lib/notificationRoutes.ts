export function getNotificationRoute(entityType: string, entityId: string): string {
  switch (entityType) {
    case "booking":
      return `/bookings/${entityId}`;
    case "agreement":
      return `/agreements/${entityId}`;
    case "meeting":
      return `/meetings/${entityId}`;
    case "review":
      return `/bookings/${entityId}`;
    case "document":
      return "/profile";
    case "milestone":
      return `/bookings/${entityId}`;
    case "job":
      return `/jobs/${entityId}`;
    case "cruise_mode_activity":
      return "/cruise-mode?tab=activity";
    case "talent_search_activity":
      return "/talent-search?tab=activity";
    default:
      return "/dashboard";
  }
}
