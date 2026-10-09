export const queryKeys = {
  literatureItems: (courseId: string) => ["courses", courseId, "literature", "items"] as const,
};
