-- Règlement (conditions) rédigé par l'employeur, affiché à droite de la signature
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_terms text;

-- Affiche ou non ce règlement sur les documents issus d'un devis
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS include_terms boolean DEFAULT true;
