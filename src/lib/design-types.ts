export type DesignTypeDef = {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  aspect: "portrait" | "landscape" | "square";
  fields: string[];
};

export const DESIGN_TYPES: DesignTypeDef[] = [
  { id: "design-poster", label: "Poster", emoji: "🖼️", hint: "Event / promo poster", aspect: "portrait", fields: ["Headline", "Details", "Date & place"] },
  { id: "design-banner", label: "Banner", emoji: "🚩", hint: "Web or shop banner", aspect: "landscape", fields: ["Headline", "Offer", "Brand"] },
  { id: "design-logo", label: "Logo", emoji: "✨", hint: "Brand mark", aspect: "square", fields: ["Brand name", "Industry", "Symbol idea"] },
  { id: "design-visiting-card", label: "Visiting Card", emoji: "🪪", hint: "Business card design", aspect: "landscape", fields: ["Name", "Role", "Phone / email"] },
  { id: "design-thumbnail", label: "Thumbnail", emoji: "▶️", hint: "Video thumbnail", aspect: "landscape", fields: ["Video title", "Mood"] },
  { id: "design-social", label: "Social Media Post", emoji: "📱", hint: "Instagram / FB post", aspect: "square", fields: ["Message", "Brand", "Call to action"] },
  { id: "design-certificate", label: "Certificate", emoji: "🏅", hint: "Award design", aspect: "landscape", fields: ["Recipient", "Achievement", "Issuer"] },
  { id: "design-invitation", label: "Invitation", emoji: "💌", hint: "Party / wedding invite", aspect: "portrait", fields: ["Occasion", "Host", "Date & venue"] },
  { id: "design-flyer", label: "Flyer", emoji: "📢", hint: "Handout flyer", aspect: "portrait", fields: ["Offer", "Details", "Contact"] },
  { id: "design-menu", label: "Menu Card", emoji: "🍽️", hint: "Restaurant menu design", aspect: "portrait", fields: ["Restaurant", "Dishes", "Prices"] },
];

export function isDesignType(id: string) {
  return DESIGN_TYPES.some((d) => d.id === id);
}

export function designType(id: string) {
  return DESIGN_TYPES.find((d) => d.id === id);
}
