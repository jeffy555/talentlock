import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AgreementPdfData } from "./agreementPdfUtils";
import { signatureCursiveFontFamily } from "./agreementPdfFonts";

const styles = StyleSheet.create({
  page: { padding: 60, fontFamily: "Helvetica", fontSize: 10, color: "#1F2937" },
  header: { marginBottom: 24, borderBottom: "2pt solid #1E3A5F", paddingBottom: 16 },
  logoText: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1E3A5F", marginBottom: 4 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  metaSection: { marginBottom: 8 },
  metaLabel: { fontSize: 9, color: "#6B7280", fontFamily: "Helvetica-Bold", marginBottom: 2 },
  metaValue: { fontSize: 10, marginBottom: 4 },
  divider: { borderBottom: "1pt solid #E5E7EB", marginVertical: 16 },
  paragraph: { fontSize: 10, lineHeight: 1.6, marginBottom: 8, color: "#374151" },
  signaturePage: { padding: 60 },
  signaturesHeading: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 24, color: "#1E3A5F" },
  signaturesRow: { flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "45%" },
  signatureRoleLabel: { fontSize: 9, color: "#6B7280", fontFamily: "Helvetica-Bold", marginBottom: 8 },
  signatureImage: { width: 160, height: 60, objectFit: "contain", marginBottom: 4 },
  signatureCursive: { fontSize: 22, marginBottom: 4, color: "#1F2937" },
  signatureLine: { borderBottom: "1pt solid #9CA3AF", marginBottom: 6 },
  signatureName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  signatureRole: { fontSize: 9, color: "#6B7280", marginBottom: 2 },
  signatureDate: { fontSize: 9, color: "#6B7280" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 60,
    right: 60,
    borderTop: "1pt solid #E5E7EB",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: "#9CA3AF" },
  pageNumber: { fontSize: 8, color: "#9CA3AF" },
  legalFooter: { fontSize: 9, color: "#6B7280" },
});

export function AgreementPdf({ data }: { data: AgreementPdfData }) {
  const cursiveFont = signatureCursiveFontFamily();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logoText}>TalentLock</Text>
          <Text style={styles.title}>FREELANCE ENGAGEMENT AGREEMENT</Text>
        </View>

        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>AGREEMENT ID</Text>
          <Text style={styles.metaValue}>{data.agreementId}</Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>GENERATED</Text>
          <Text style={styles.metaValue}>{data.generatedAt}</Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>EMPLOYER</Text>
          <Text style={styles.metaValue}>
            {data.employerDisplayName}
            {data.employerCompany ? ` — ${data.employerCompany}` : ""}
          </Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>FREELANCER</Text>
          <Text style={styles.metaValue}>{data.freelancerDisplayName}</Text>
        </View>
        <View style={styles.divider} />

        {data.contentParagraphs.map((para, i) => (
          <Text key={i} style={styles.paragraph}>
            {para}
          </Text>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>TalentLock — Agreement {data.agreementId}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>

      <Page size="A4" style={styles.signaturePage}>
        <Text style={styles.signaturesHeading}>SIGNATURES</Text>
        <View style={styles.signaturesRow}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureRoleLabel}>EMPLOYER</Text>
            {data.employerSignatureUrl ? (
              <Image src={data.employerSignatureUrl} style={styles.signatureImage} />
            ) : (
              <Text style={[styles.signatureCursive, { fontFamily: cursiveFont }]}>
                {data.employerTypedName || data.employerDisplayName}
              </Text>
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{data.employerDisplayName}</Text>
            {data.employerCompany ? (
              <Text style={styles.signatureRole}>{data.employerCompany}</Text>
            ) : null}
            <Text style={styles.signatureDate}>Signed: {data.employerSignedAt}</Text>
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureRoleLabel}>FREELANCER</Text>
            {data.freelancerSignatureUrl ? (
              <Image src={data.freelancerSignatureUrl} style={styles.signatureImage} />
            ) : (
              <Text style={[styles.signatureCursive, { fontFamily: cursiveFont }]}>
                {data.freelancerTypedName || data.freelancerDisplayName}
              </Text>
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{data.freelancerDisplayName}</Text>
            {data.freelancerField ? (
              <Text style={styles.signatureRole}>{data.freelancerField}</Text>
            ) : null}
            <Text style={styles.signatureDate}>Signed: {data.freelancerSignedAt}</Text>
          </View>
        </View>

        <View style={[styles.divider, { marginTop: 48 }]} />
        <Text style={styles.legalFooter}>
          This document was generated by TalentLock and constitutes a legally binding agreement
          between the parties named above. Agreement ID: {data.agreementId}
        </Text>
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>TalentLock — Agreement {data.agreementId}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
