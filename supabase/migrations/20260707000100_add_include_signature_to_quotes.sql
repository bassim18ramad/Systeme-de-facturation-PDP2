-- Permet d'inclure ou non la signature de l'entreprise sur un devis
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS include_signature boolean DEFAULT true;
