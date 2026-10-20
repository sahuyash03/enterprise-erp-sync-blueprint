import crypto from "crypto";

export interface LegacyERPLine {
    ACC_NUM: string;
    DEBIT_AMT: number;
    CREDIT_AMT: number;
    COST_CENTER?: string;
}

export interface LegacyERPEntry {
    VCR_NUM: string;
    ENTRY_DATE: string;
    CURRENCY: string;
    LINES: LegacyERPLine[];
}

export interface NormalizedJournalEntry {
    transactionId: string;
    legacyDocumentId: string;
    bookedAt: string;
    currency: string;
    totalDebitCents: number;
    totalCreditCents: number;
    isBalanced: boolean;
    reconciliationFingerprint: string;
    items: Array<{
        accountId: string;
        debitCents: number;
        creditCents: number;
        costCenter: string | null;
    }>;
}

export class EnterpriseLedgerNormalizer {
    /**
     * Normalizes legacy floating-point ERP records into fixed-point integer cents,
     * validates strict dual-entry balance, and builds an audit verification hash.
     */
    public normalize(entry: LegacyERPEntry): NormalizedJournalEntry {
        let totalDebitCents = 0;
        let totalCreditCents = 0;

        const items = entry.LINES.map((line) => {
            const debitCents = Math.round(line.DEBIT_AMT * 100);
            const creditCents = Math.round(line.CREDIT_AMT * 100);

            totalDebitCents += debitCents;
            totalCreditCents += creditCents;

            return {
                accountId: line.ACC_NUM.trim(),
                debitCents,
                creditCents,
                costCenter: line.COST_CENTER?.trim() || null,
            };
        });

        const isBalanced = totalDebitCents === totalCreditCents;
        if (!isBalanced) {
            throw new Error(
                `Ledger imbalance detected for DocNum ${entry.VCR_NUM}: Debit ${totalDebitCents} != Credit${totalCreditCents}`
            );
        }

        // Cryptographic fingerprint for ledger state audit & idempotency validation
        const reconciliationFingerprint = crypto
            .createHash("sha256")
            .update(`${entry.VCR_NUM}:${entry.ENTRY_DATE}:${totalDebitCents}`)
            .digest("hex");

        return {
            transactionId: `tx_norm_${crypto.randomUUID()}`,
            legacyDocumentId: entry.VCR_NUM,
            bookedAt: new Date(entry.ENTRY_DATE).toISOString(),
            currency: entry.CURRENCY,
            totalDebitCents,
            totalCreditCents,
            isBalanced,
            reconciliationFingerprint,
            items,
        };
    }
}