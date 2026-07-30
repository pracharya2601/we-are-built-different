import type { PrivacyKeyRule } from "./types.ts";

export const DEFAULT_KEY_RULES: readonly PrivacyKeyRule[] = [
  {
    action: "drop",
    category: "credential",
    name: "credentials",
    pattern:
      /^(?:authorization|cookie|password|passcode|pin|secret|accessToken|refreshToken|idToken|apiKey|privateKey|clientSecret|sessionToken)$/iu,
  },
  {
    action: "protect",
    category: "email",
    name: "email-field",
    pattern: /^(?:email|emailAddress|primaryEmail|alternateEmail)$/iu,
  },
  {
    action: "protect",
    category: "phone",
    name: "phone-field",
    pattern:
      /^(?:phone|phoneNumber|mobile|mobileNumber|telephone|fax)$/iu,
  },
  {
    action: "protect",
    category: "person-name",
    name: "person-name-field",
    pattern:
      /^(?:name|fullName|firstName|middleName|lastName|preferredName|legalName|displayName)$/iu,
  },
  {
    action: "protect",
    category: "postal-address",
    name: "address-field",
    pattern:
      /^(?:address|address1|address2|street|streetAddress|mailingAddress|postalAddress)$/iu,
  },
  {
    action: "protect",
    category: "date-of-birth",
    name: "birth-date-field",
    pattern: /^(?:birthDate|dateOfBirth|dob)$/iu,
  },
  {
    action: "protect",
    category: "government-identifier",
    name: "government-id-field",
    pattern:
      /^(?:ssn|socialSecurityNumber|taxId|tin|passport|passportNumber|driversLicense|nationalId)$/iu,
  },
  {
    action: "protect",
    category: "credit-card",
    name: "payment-card-field",
    pattern:
      /^(?:cardNumber|creditCard|debitCard|pan|paymentCardNumber|cvv|cvc)$/iu,
  },
  {
    action: "protect",
    category: "account-identifier",
    name: "account-id-field",
    pattern:
      /^(?:accountId|auth0Id|beneficiaryId|customerId|memberId|patientId|providerId|stripeCustomerId|subjectId|userId|workspaceId)$/iu,
  },
  {
    action: "protect",
    category: "ip-address",
    name: "ip-address-field",
    pattern: /^(?:ip|ipAddress|clientIp|remoteAddress)$/iu,
  },
];
