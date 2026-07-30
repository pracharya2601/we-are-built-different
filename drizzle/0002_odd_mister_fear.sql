ALTER TABLE `workspaces`
ADD `workspace_type` text DEFAULT 'team' NOT NULL
CHECK (`workspace_type` in ('personal', 'team'));
