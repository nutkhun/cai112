-- Transfer Kanyarat's group to the correct record
UPDATE students SET group_id = 'cdc076d9-4e44-4320-b7ab-2a3758d38e2b' WHERE id = 'bc25f4b8-d88a-46e5-8126-c66680e18100';

-- Remove invalid duplicates
DELETE FROM students WHERE id IN (
  'c4ee9307-bdb4-4800-b692-ab21294e062d',
  'a714ab08-8cfd-417a-9f83-a6aafd0a14f1'
);