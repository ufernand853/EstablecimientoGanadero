export type PublicPlan = {
  code: string;
  name: string;
  priceAmount: number | null;
  amountCents: number;
  currency: string;
  billingPeriodDays: number;
  trialDays: number;
  animalLimit: number | null;
  description: string;
  ctaLabel: string;
  featureList: string[];
  isDemo: boolean;
  isSelfService: boolean;
  availableProviders?: ("mercadopago" | "dodo")[];
  defaultProvider?: "mercadopago" | "dodo" | null;
};

export type LicenseResponse = {
  tenant: {
    id: string;
    name: string;
    role: string;
  };
  license: {
    code: string;
    name: string;
    description: string;
    ctaLabel: string;
    currency: string;
    amountCents: number;
    animalLimit: number | null;
    featureList: string[];
    status: string;
    currentPeriodEnd: string;
  } | null;
  usage: {
    usedAnimals: number;
    animalLimit: number | null;
    remainingAnimals: number | null;
    establishments: number;
  };
  subscription: {
    provider: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  } | null;
};

export function formatMoney(currency: string, amount: number | null) {
  if (amount == null) return "A medida";
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatPlanPrice(plan: Pick<PublicPlan, "currency" | "priceAmount">) {
  if (plan.priceAmount == null) return "Precio a medida";
  return `${formatMoney(plan.currency, plan.priceAmount)}/mes`;
}

export function formatAnimalLimit(animalLimit: number | null) {
  if (animalLimit == null) return "Animales ilimitados";
  return `Hasta ${animalLimit.toLocaleString("es-UY")} animales`;
}
