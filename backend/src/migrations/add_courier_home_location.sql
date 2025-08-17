-- Add home location and notification radius to couriers table
-- This migration adds the home location and km radius for location-based notifications

-- Add home location coordinates (where courier lives/works from)
ALTER TABLE couriers 
ADD COLUMN IF NOT EXISTS home_latitude DECIMAL(10, 8) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS home_longitude DECIMAL(11, 8) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS km_radius INTEGER DEFAULT 10 CHECK (km_radius >= 0 AND km_radius <= 100);

-- Update existing couriers to have a default 10km radius
UPDATE couriers 
SET km_radius = 10 
WHERE km_radius IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN couriers.home_latitude IS 'Kuryenin Çalışma merkezi konumu - enlem';
COMMENT ON COLUMN couriers.home_longitude IS 'Kuryenin Çalışma merkezi konumu - boylam';
COMMENT ON COLUMN couriers.km_radius IS 'Kurye bildirim alacağı mesafe çapı (0-100km)';
