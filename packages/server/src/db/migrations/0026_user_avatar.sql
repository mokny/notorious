-- Lets a user upload a profile picture (see modules/users/) - null until set,
-- with users.avatar_color staying the fallback rendered wherever this is null.
ALTER TABLE users ADD COLUMN avatar_url TEXT;
