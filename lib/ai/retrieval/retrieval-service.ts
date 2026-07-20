import type { AiClassification } from "@/lib/ai/schemas/chat";

export interface RetrievalDocument {
  id: string;
  canonicalOrganizationId: string;
  sourceApplication: string;
  sourceObjectType: string;
  sourceObjectId: string;
  sourceUrl: string;
  documentTitle: string;
  documentType: string;
  classification: AiClassification;
  approvalStatus: "APPROVED" | "REJECTED" | "SUPERSEDED" | "DRAFT";
  revision: string;
  effectiveDate: string;
  authorizedRoles: string[];
  authorizedPermissions: string[];
  contentHash: string;
  chunkIndex: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface RetrievalCitation {
  documentId: string;
  title: string;
  sourceApplication: string;
  sourceObjectId: string;
  sourceUrl: string;
  revision: string;
  chunkIndex: number;
  excerpt: string;
}

export interface RetrievalResult {
  document: RetrievalDocument;
  score: number;
  citation: RetrievalCitation;
}

export interface RetrievalQuery {
  query: string;
  canonicalOrganizationId: string;
  allowedClassifications: AiClassification[];
  roles: string[];
  permissions: string[];
  limit: number;
}

export interface RetrievalAdapter {
  search(query: RetrievalQuery): Promise<RetrievalResult[]>;
  health(): Promise<{ ok: boolean; documentCount: number; detail: string }>;
}

export class DeterministicRetrievalAdapter implements RetrievalAdapter {
  constructor(private readonly documents: RetrievalDocument[]) {}

  async search(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const terms = tokenize(query.query);
    return this.documents
      .filter((document) => document.canonicalOrganizationId === query.canonicalOrganizationId)
      .filter((document) => query.allowedClassifications.includes(document.classification))
      .filter((document) => document.approvalStatus === "APPROVED")
      .filter((document) => authorized(document, query.roles, query.permissions))
      .map((document) => ({ document, score: scoreDocument(document, terms), citation: citationFor(document) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
      .slice(0, query.limit);
  }

  async health() {
    return { ok: true, documentCount: this.documents.length, detail: "Deterministic approved-document corpus ready" };
  }
}

export function createDevelopmentCorpus(canonicalOrganizationId: string): RetrievalDocument[] {
  const now = "2026-07-20T00:00:00.000Z";
  return [
    developmentDocument({
      id: "dev-capabilities-1",
      canonicalOrganizationId,
      sourceApplication: "hub",
      sourceObjectType: "PublicCapabilitySummary",
      sourceObjectId: "mactech-public-capabilities",
      sourceUrl: "/docs/AI_ARCHITECTURE.md#development-corpus",
      documentTitle: "MacTech Public Capability Summary",
      documentType: "PUBLIC_SUMMARY",
      classification: "PUBLIC",
      revision: "1",
      content: "MacTech Solutions supports federal proposal execution, cybersecurity readiness, quality management, training, pricing coordination, and contract delivery through separate domain-authority applications coordinated by Hub.",
      now,
    }),
    developmentDocument({
      id: "dev-solicitation-1",
      canonicalOrganizationId,
      sourceApplication: "growth-capture",
      sourceObjectType: "SyntheticSolicitationExcerpt",
      sourceObjectId: "SYN-RFQ-2026-001",
      sourceUrl: "/docs/AI_LOCAL_TESTING.md#synthetic-corpus",
      documentTitle: "Synthetic RFQ: Secure Engineering Support",
      documentType: "SYNTHETIC_SOLICITATION",
      classification: "INTERNAL",
      revision: "1",
      content: "Synthetic test only. Responses are due August 15, 2026. The offeror must provide a technical approach, staffing plan, and fixed-price quote. No FCI, CUI, customer data, or real solicitation content is included.",
      now,
    }),
    developmentDocument({
      id: "dev-qms-1",
      canonicalOrganizationId,
      sourceApplication: "qms",
      sourceObjectType: "SyntheticProcedure",
      sourceObjectId: "SYN-QMS-DOC-001",
      sourceUrl: "/docs/AI_LOCAL_TESTING.md#synthetic-corpus",
      documentTitle: "Synthetic Draft Review Procedure",
      documentType: "SYNTHETIC_QMS_PROCEDURE",
      classification: "INTERNAL",
      revision: "1",
      content: "Synthetic test only. Draft documents require a named human reviewer. AI-generated content remains DRAFT until the QMS authority records an approval; AI may never approve its own output.",
      now,
    }),
  ];
}

function developmentDocument(input: {
  id: string; canonicalOrganizationId: string; sourceApplication: string; sourceObjectType: string;
  sourceObjectId: string; sourceUrl: string; documentTitle: string; documentType: string;
  classification: AiClassification; revision: string; content: string; now: string;
}): RetrievalDocument {
  return {
    ...input,
    approvalStatus: "APPROVED",
    effectiveDate: input.now,
    authorizedRoles: ["*"],
    authorizedPermissions: ["ai.retrieve"],
    contentHash: simpleHash(input.content),
    chunkIndex: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function authorized(document: RetrievalDocument, roles: string[], permissions: string[]): boolean {
  const roleAllowed = document.authorizedRoles.includes("*") || document.authorizedRoles.some((role) => roles.includes(role));
  const permissionAllowed = document.authorizedPermissions.length === 0 || document.authorizedPermissions.some((permission) => permissions.includes(permission));
  return roleAllowed && permissionAllowed;
}

function scoreDocument(document: RetrievalDocument, terms: string[]): number {
  const haystack = tokenize(`${document.documentTitle} ${document.content}`);
  const set = new Set(haystack);
  return terms.reduce((score, term) => score + (set.has(term) ? 2 : haystack.some((word) => word.startsWith(term)) ? 1 : 0), 0);
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}

function citationFor(document: RetrievalDocument): RetrievalCitation {
  return {
    documentId: document.id,
    title: document.documentTitle,
    sourceApplication: document.sourceApplication,
    sourceObjectId: document.sourceObjectId,
    sourceUrl: document.sourceUrl,
    revision: document.revision,
    chunkIndex: document.chunkIndex,
    excerpt: document.content.slice(0, 280),
  };
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
