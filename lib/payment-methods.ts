export type ManualMethodId = "instapay" | "vodafone_cash";

export type ManualPaymentMethod = {
  id: ManualMethodId;
  name: string;
  handle: string;
  instructions: string;
};

export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = [
  {
    id: "instapay",
    name: "Instapay",
    handle: "warreni-web1@instapay",
    instructions:
      "حوّل المبلغ على حساب Instapay وابعت نفس رقم التحويل في الخانة تحت.",
  },
  {
    id: "vodafone_cash",
    name: "فودافون كاش",
    handle: "01055891861",
    instructions:
      "حوّل المبلغ على رقم محفظة فودافون كاش وابعت رقم الموبايل اللي حوّلت منه.",
  },
];

export function getManualMethod(id: string) {
  return MANUAL_PAYMENT_METHODS.find((method) => method.id === id);
}
