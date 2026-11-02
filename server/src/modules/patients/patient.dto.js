export function toPatientDto(row) {
  return { patientId: row.patient_id, code: row.code, displayName: row.display_name };
}
