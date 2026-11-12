export async function up(db) {
  await db.collection('predictions').createIndex({ questionnaireId: 1 }, { unique: true, name: 'predictions_questionnaire_unique' });
  await db.collection('notifications').createIndex(
    { recipientId: 1, kind: 1, 'payload.questionnaireId': 1 },
    { unique: true, partialFilterExpression: { 'payload.questionnaireId': { $type: 'string' } }, name: 'notifications_report_ready_unique' },
  );
  await db.collection('auditLogs').createIndex(
    { 'details.questionnaireId': 1, action: 1 },
    { unique: true, partialFilterExpression: { action: 'score_generated', 'details.questionnaireId': { $type: 'string' } }, name: 'audit_score_generated_questionnaire_unique' },
  );
}

export async function down(db) {
  await db.collection('predictions').dropIndex('predictions_questionnaire_unique');
  await db.collection('notifications').dropIndex('notifications_report_ready_unique');
  await db.collection('auditLogs').dropIndex('audit_score_generated_questionnaire_unique');
}
