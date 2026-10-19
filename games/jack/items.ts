import type { ItemDef } from 'web-scumm/content';

// Inventory items. `look` as a list = one line per look, cycling.
export const items: Record<string, ItemDef> = {
  mireille: { name: 'Mireille', icon: 'items/mireille', look: ['Mireille, mon araignée de compagnie. Elle habite dans ma tête.', 'Elle tricote. Dans ma tête. Ça chatouille.', 'Si je suis perdu, je lui parle.', 'Elle me fait coucou avec six pattes sur huit.'] },
  lanterne: { name: 'lanterne', icon: 'items/lanterne', look: ['Ma lanterne. Elle éclaire. Comme ma tête, mais en plus petit.', 'Une lanterne qui cherche une tête.'] },
  badge: { name: 'badge', icon: 'items/badge', look: ['« Employé du mois ». Les douze mois. Il n\'y avait que moi.', 'Je le garde. Souvenir.'] },
  chaussette: { name: 'chaussette', icon: 'items/chaussette', look: ['Une chaussette verte, toute gluante. Ça ne vient pas de chez moi.', 'Elle sent le blob.'] },
  barbe: { name: 'barbe à papa', icon: 'items/barbe', look: ['Une barbe à papa rose. Ma paie. Je ne la mange pas, je n\'ai pas d\'estomac.', 'Quelqu\'un en rêve, sur la place.'] },
  boulon: { name: 'boulon', icon: 'items/boulon', look: ['Un boulon de cou. Encore tiède. Beurk.', 'Il manque au Maire.'] },
  nez: { name: 'nez de clown', icon: 'items/nez', look: ['Un nez rouge. Pouet.', 'Avec ça, j\'aurai une tête de fête.'] },
  photo_ratee: { name: 'photo ratée', icon: 'items/photo_ratee', look: ['Ma photo. Même moi, j\'ai un peu peur.', 'Le photographe, c\'était une machine. Elle a démissionné.'] },
  photo: { name: 'photo d\'identité', icon: 'items/photo', look: ['J\'ai l\'air d\'un comptable qui aime les ballons. Parfait.'] },
  lettre: { name: 'lettre de recommandation', icon: 'items/lettre', look: ['« Jack est honnête, travailleur, et il a rendu un boulon. » Signé : le Maire.'] },
};
