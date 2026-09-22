function onFormSubmitDocumentalistas(e) {
  var raw;
  try {
    raw = DocumentalistasForm.eventToRaw(e);
    var config = DocumentalistasConfig.get();
    DocumentalistasWorkflow.enqueueResponse(raw.responseId, config);
    var result = DocumentalistasWorkflow.processRaw(raw, { enqueueOnLockFailure: true, explicit: false, rejectDuplicateIdentity: true });
    if (result.status !== 'QUEUED_FOR_RETRY') DocumentalistasWorkflow.removePendingResponse(raw.responseId);
    DocumentalistasErrors.log('FORM_SUBMIT', result.status, { responseId: raw.responseId, identityKey: result.identityKey });
    return result;
  } catch (error) {
    var normalized = DocumentalistasErrors.asError(error);
    if (raw && raw.responseId) {
      try { DocumentalistasWorkflow.removePendingResponse(raw.responseId); } catch (queueError) {
        DocumentalistasErrors.log('FORM_SUBMIT_PENDING_QUEUE_CLEANUP', 'ERROR', { responseId: raw.responseId, errorCode: DocumentalistasErrors.asError(queueError).code });
      }
      try {
        DocumentalistasErrorCompensation.enqueue(raw.responseId, normalized, DocumentalistasConfig.get());
        var compensation = DocumentalistasErrorCompensation.processOne(raw.responseId, false);
        DocumentalistasErrors.log('FORM_SUBMIT', compensation.status, { responseId: raw.responseId, errorCode: normalized.code, compensation: compensation });
        return compensation;
      } catch (compensationError) {
        DocumentalistasErrors.log('FORM_ERROR_COMPENSATION_ENQUEUE', 'ERROR', {
          responseId: raw.responseId,
          originalErrorCode: normalized.code,
          compensationErrorCode: DocumentalistasErrors.asError(compensationError).code
        });
      }
    }
    DocumentalistasErrors.log('FORM_SUBMIT', 'ERROR', { responseId: raw && raw.responseId, errorCode: normalized.code, errorMessage: normalized.message });
    throw normalized;
  }
}

function retomarFilaPendenteDocumentalistas(e) {
  var config = DocumentalistasConfig.get();
  DocumentalistasWorkflow.acknowledgeScheduledTrigger(e, 'PENDING_RESPONSE_RETRY_TRIGGER_UID');
  var batch = DocumentalistasWorkflow.pendingResponses(1);
  var failures = [];
  if (batch.length) DocumentalistasWorkflow.scheduleRetry(config, e && e.triggerUid);
  batch.forEach(function (responseId) {
    try {
      reprocessarRespostaDocumentalistas(responseId);
      DocumentalistasWorkflow.removePendingResponse(responseId);
    } catch (error) {
      var normalized = DocumentalistasErrors.asError(error);
      failures.push(responseId);
      try { DocumentalistasWorkflow.removePendingResponse(responseId); } catch (queueError) {
        DocumentalistasErrors.log('RETRY_QUEUE_CLEANUP', 'ERROR', { responseId: responseId, errorCode: DocumentalistasErrors.asError(queueError).code });
      }
      try {
        DocumentalistasErrorCompensation.enqueue(responseId, normalized, config);
        DocumentalistasErrorCompensation.processOne(responseId, false);
      } catch (compensationError) {
        DocumentalistasErrors.log('RETRY_ERROR_COMPENSATION_ENQUEUE', 'ERROR', {
          responseId: responseId,
          originalErrorCode: normalized.code,
          compensationErrorCode: DocumentalistasErrors.asError(compensationError).code
        });
      }
      DocumentalistasErrors.log('RETRY_QUEUE', 'ERROR', { responseId: responseId, errorCode: normalized.code, errorMessage: normalized.message });
    }
  });
  var remainingCount = DocumentalistasWorkflow.pendingResponseCount();
  if (remainingCount) DocumentalistasWorkflow.scheduleRetry(config, e && e.triggerUid);
  return { attempted: batch.length, failed: failures.length, remainingNotProcessed: remainingCount };
}

function retomarImportacaoHistoricaDocumentalistas(e) {
  return DocumentalistasHistoricalImport.runBatch(e || null);
}

function retomarFilaHistoricaDocumentalistas(e) {
  return DocumentalistasHistoricalImport.runRetryQueue(e || null);
}
