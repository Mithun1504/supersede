-- The approved edge reviewer is the initial configured reviewer for artifact remediation.
-- Object ownership still grants only submission access; verification remains a distinct capability.
INSERT INTO role_permission (role_code, permission_code)
VALUES ('edge_reviewer', 'artifact.verify')
ON CONFLICT DO NOTHING;
