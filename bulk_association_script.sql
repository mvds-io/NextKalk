-- Bulk create associations between vass_vann and vass_lasteplass
-- This script matches vass_vann.lp_info with vass_lasteplass.kode

INSERT INTO vass_associations (airport_id, landingsplass_id)
SELECT DISTINCT 
    vv.id as airport_id,
    vl.id as landingsplass_id
FROM vass_vann vv
JOIN vass_lasteplass vl ON vv.lp_info = vl.kode
WHERE NOT EXISTS (
    -- Avoid duplicates by checking if association already exists
    SELECT 1 FROM vass_associations va 
    WHERE va.airport_id = vv.id 
    AND va.landingsplass_id = vl.id
)
AND vv.lp_info IS NOT NULL 
AND vv.lp_info != ''
AND vl.kode IS NOT NULL 
AND vl.kode != '';

-- Optional: Check how many associations were created
-- SELECT COUNT(*) as new_associations_created FROM vass_associations; 