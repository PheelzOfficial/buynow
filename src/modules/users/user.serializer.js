export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  phone: u.phone,
  avatar: u.avatar,
  role: u.role,
  verified: u.verified,
  preferences: u.preferences,
  createdAt: u.createdAt,
});
