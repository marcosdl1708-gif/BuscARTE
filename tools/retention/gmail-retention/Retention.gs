/* LOCAL TEMPLATE: not installed or authorized by adding these files to Git.
 * Advanced Gmail service, not GmailApp/MailApp. No send, permanent delete,
 * HTTP fetch, website/DB access or classification based on subject/date/read.
 *
 * Operator-created labels (no filter auto-enrols mail):
 *   BuscARTE/Admin/Pendiente — explicitly enrol an ordinary admin case.
 *   BuscARTE/Admin/Cerrar — explicitly mark that case resolved now.
 *   BuscARTE/Admin/Cerrado — maintained by this script after observing Cerrar.
 *   BuscARTE/Admin/Conservar — indefinite hold; remove + close anew to resume.
 * Do not enrol security, legal or unrelated conversations. Unknown labels in
 * BuscARTE/Admin/ fail closed. Removing a label does not delete any message.
 *
 * Script Properties, set explicitly only after code/OAuth review:
 *   RETENTION_GMAIL_API_ENABLED=true (the advanced service must also be enabled)
 *   RETENTION_MODE=ACTIVE (absent/other values => AUDIT_ONLY)
 * auditRetention() suppresses ALL Gmail, Properties and trigger writes even
 * if ACTIVE is configured. setupRetention() installs one daily trigger ONLY
 * with ACTIVE, exact verified account and all four existing user labels.
 * No time-trigger is installed by importing this source or running an audit.
 * Script-managed Trash is recovered by exact attempted message IDs if a case
 * reopens, is held, changes, or the batch fails. No previous manual Trash is
 * enrolled. Restoring requires those messages still exist in Gmail Trash;
 * recovery after Google's permanent removal cannot be guaranteed.
 *
 * Cerrar is timestamped when FIRST OBSERVED, never backdated from message age.
 * After >=60 days the exact unchanged messages can move to Gmail Trash.
 * Gmail normally removes Trash after a further 30 days, outside this script.
 * A daily trigger is best effort: this is not an exact 90-day purge guarantee.
 * The operator can stop triggers/change mode; no automatic permanent deletion.
 */
var RETENTION = Object.freeze({
  account: 'buscarte.webmail@gmail.com', prefix: 'sbr.case.',
  labelPrefix: 'BuscARTE/Admin/', labels: Object.freeze({
    pending: 'BuscARTE/Admin/Pendiente', close: 'BuscARTE/Admin/Cerrar',
    closed: 'BuscARTE/Admin/Cerrado', hold: 'BuscARTE/Admin/Conservar'
  }),
  daysToTrash: 60, metadataDaysAfterTrash: 35,
  maxThreads: 40, maxMessagesPerThread: 20, maxTrashMessages: 40,
  maxMillis: 240000, trigger: 'dailyRetention'
});

function auditRetention() { return retentionReport_(runRetention_(true)); }
function dailyRetention() { return retentionReport_(runRetention_(false)); }
function retentionReport_(report) {
  // Only bounded aggregates and fixed label names from this source, never IDs,
  // Gmail content, provider errors or Properties values.
  console.log(JSON.stringify(report));
  return report;
}

// Read-only integration diagnosis. Compare response shapes only: the old
// partial mask can leave no selected fields when an opted-in label is empty.
// Do not log IDs, content, addresses, raw errors or Properties values.
function diagnoseRetentionReadOnly() {
  var ctx = retentionContext_(), report = { accountVerified: true, mode: 'AUDIT_ONLY',
    diagnostic: true, trackedRecordsCount: 0, labels: [], errors: 0 };
  report.trackedRecordsCount = Object.keys(ctx.properties.getProperties()).filter(function(key) {
    return key.indexOf(RETENTION.prefix) === 0;
  }).length;
  function shape(result) {
    var object = result && typeof result === 'object' && !Array.isArray(result);
    return { responseType: result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result,
      threadsPresent: !!object && Object.prototype.hasOwnProperty.call(result, 'threads'),
      threadCount: object && Array.isArray(result.threads) ? result.threads.length : null,
      hasNextPageToken: !!(object && result.nextPageToken),
      resultSizeEstimate: object && Number.isSafeInteger(result.resultSizeEstimate) &&
        result.resultSizeEstimate >= 0 ? result.resultSizeEstimate : null };
  }
  Object.keys(ctx.labels).forEach(function(key) {
    try {
      var params = { labelIds: [ctx.labels[key]], includeSpamTrash: false,
        maxResults: RETENTION.maxThreads + 1, fields: 'threads(id),nextPageToken' };
      var legacy = Gmail.Users.Threads.list('me', params);
      params.fields += ',resultSizeEstimate';
      var complete = Gmail.Users.Threads.list('me', params);
      report.labels.push({ label: RETENTION.labels[key], legacy: shape(legacy), withEstimate: shape(complete) });
    } catch (_) { report.errors++; }
  });
  return retentionReport_(report);
}

function retentionContext_() {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('RETENTION_GMAIL_API_ENABLED') !== 'true')
    throw new Error('RETENTION_API_NOT_EXPLICITLY_ENABLED');
  var profile = Gmail.Users.getProfile('me', { fields: 'emailAddress' });
  if (!profile || String(profile.emailAddress || '').trim().toLowerCase() !== RETENTION.account)
    throw new Error('RETENTION_WRONG_ACCOUNT');
  var response = Gmail.Users.Labels.list('me', { fields: 'labels(id,name,type)' });
  if (!response || !Array.isArray(response.labels)) throw new Error('RETENTION_LABELS_UNAVAILABLE');
  var labels = {}, unknown = [];
  response.labels.forEach(function(label) {
    Object.keys(RETENTION.labels).forEach(function(key) {
      if (label.name === RETENTION.labels[key] && label.type === 'user') labels[key] = label.id;
    });
    if (String(label.name || '').indexOf(RETENTION.labelPrefix) === 0 &&
      Object.keys(RETENTION.labels).every(function(key) { return RETENTION.labels[key] !== label.name; }))
      unknown.push(label.id);
  });
  var missing = Object.keys(RETENTION.labels).filter(function(key) { return !labels[key]; });
  return { properties: properties, active: properties.getProperty('RETENTION_MODE') === 'ACTIVE',
    labels: labels, unknown: unknown, missing: missing };
}

function setupRetention() {
  var ctx = retentionContext_();
  var report = { accountVerified: true, mode: ctx.active ? 'ACTIVE' : 'AUDIT_ONLY',
    missingLabels: ctx.missing.map(function(key) { return RETENTION.labels[key]; }), triggerInstalled: false };
  if (!ctx.active || ctx.missing.length) return retentionReport_(report);
  var matching = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === RETENTION.trigger;
  });
  if (matching.length > 1) throw new Error('RETENTION_DUPLICATE_TRIGGER_REVIEW_REQUIRED');
  if (!matching.length) ScriptApp.newTrigger(RETENTION.trigger).timeBased().everyDays(1)
    .atHour(4).inTimezone('America/Argentina/Buenos_Aires').create();
  report.triggerInstalled = true;
  return retentionReport_(report);
}

function retentionSnapshot_(threadId, ctx) {
  // fields excludes headers, subjects, addresses, bodies and snippets.
  var thread = Gmail.Users.Threads.get('me', threadId, {
    format: 'metadata', fields: 'id,messages(id,internalDate,labelIds)'
  });
  if (!thread || thread.id !== threadId || !Array.isArray(thread.messages) || !thread.messages.length)
    throw new Error('RETENTION_INVALID_THREAD');
  var seen = {}, messages = thread.messages.map(function(message) {
    var date = Number(message.internalDate);
    if (!/^[a-f0-9]+$/i.test(String(message.id || '')) || seen[message.id] ||
      !Number.isSafeInteger(date) || date <= 0 || !Array.isArray(message.labelIds))
      throw new Error('RETENTION_INVALID_MESSAGE');
    seen[message.id] = true;
    return { id: message.id, date: date, labels: message.labelIds.slice().sort() };
  }).sort(function(a, b) { return a.id.localeCompare(b.id); });
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(messages.map(function(message) { return [message.id, message.date]; })), Utilities.Charset.UTF_8);
  var fingerprint = bytes.map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  function has(label) { return messages.some(function(message) { return message.labels.indexOf(label) >= 0; }); }
  var flags = {};
  Object.keys(ctx.labels).forEach(function(key) { flags[key] = has(ctx.labels[key]); });
  return { id: threadId, messages: messages, fingerprint: fingerprint,
    lastMessageAt: Math.max.apply(null, messages.map(function(message) { return message.date; })),
    flags: flags, allClosed: messages.every(function(message) { return message.labels.indexOf(ctx.labels.closed) >= 0; }),
    oversized: messages.length > RETENTION.maxMessagesPerThread,
    unknown: ctx.unknown.some(has), draft: has('DRAFT'), spam: has('SPAM'),
    trashCount: messages.filter(function(message) { return message.labels.indexOf('TRASH') >= 0; }).length };
}

function retentionPlan_(snapshot, record, now) {
  var flags = snapshot.flags;
  if (record && (record.v !== 1 || record.threadId !== snapshot.id ||
    ['open', 'reopening', 'closed', 'held', 'trashing', 'trashed', 'recovering'].indexOf(record.phase) < 0 ||
    !/^[a-f0-9]{64}$/.test(record.fingerprint || '') || !Number.isSafeInteger(record.observedAt)))
    return { action: 'skip', reason: 'invalid_metadata' };
  if (record && ['trashing', 'trashed', 'recovering'].indexOf(record.phase) >= 0) {
    if (!retentionManagedIdsValid_(record)) return { action: 'skip', reason: 'invalid_managed_ids_manual_review' };
    if (record.phase !== 'trashed' || flags.hold || flags.pending || flags.close || !snapshot.allClosed ||
      snapshot.fingerprint !== record.fingerprint || snapshot.unknown || snapshot.draft || snapshot.spam || snapshot.oversized)
      return { action: 'recover', reason: 'restore_managed_before_hold_or_review' };
    return { action: 'wait', reason: 'unchanged_in_trash' };
  }
  if (!Number.isSafeInteger(now) || snapshot.lastMessageAt > now) return { action: 'skip', reason: 'future_date' };
  if (snapshot.unknown || snapshot.draft || snapshot.spam || snapshot.oversized)
    return { action: 'skip', reason: 'protected_or_unknown_labels' };
  if (flags.hold) return { action: 'hold', reason: 'explicit_hold' };
  if (record && record.phase === 'reopening') return { action: 'reopen', reason: 'finish_safe_reopen' };
  if (snapshot.trashCount) return { action: 'skip', reason: 'already_or_partly_in_trash' };
  if (record && record.phase === 'closed' && (flags.pending || !snapshot.allClosed ||
    snapshot.fingerprint !== record.fingerprint)) return { action: 'reopen', reason: 'changed_since_close' };
  if (flags.close) return { action: 'close', reason: 'explicit_close_observed_now' };
  if (!flags.pending && !flags.closed) return { action: 'forget', reason: 'not_opted_in' };
  if (!record || record.phase !== 'closed') return { action: 'skip', reason: flags.closed ? 'close_record_required' : 'open_case' };
  if (!Number.isSafeInteger(record.closedAt) || record.closedAt > now ||
    record.closedAt < snapshot.lastMessageAt) return { action: 'skip', reason: 'invalid_close_time' };
  return now - record.closedAt >= RETENTION.daysToTrash * 86400000 ?
    { action: 'trash', reason: 'sixty_days_after_close' } : { action: 'wait', reason: 'within_retention' };
}

function retentionManagedIdsValid_(record) {
  var managed = record.managedMessageIds, attempted = record.attemptedMessageIds;
  function idsValid(values) {
    return Array.isArray(values) && values.length <= RETENTION.maxMessagesPerThread &&
      values.every(function(id, index) { return /^[a-f0-9]+$/i.test(String(id)) && values.indexOf(id) === index; });
  }
  return idsValid(managed) && managed.length > 0 && idsValid(attempted) &&
    attempted.every(function(id) { return managed.indexOf(id) >= 0; });
}

function retentionRecover_(id, ctx, record, report, now) {
  if (!retentionManagedIdsValid_(record)) throw new Error('RETENTION_INVALID_MANAGED_IDS');
  report.manualReviewRequired = true;
  var key = RETENTION.prefix + id, state = Object.assign({}, record,
    { phase: 'recovering', closedAt: null, observedAt: now, requiresNewClose: true });
  ctx.properties.setProperty(key, JSON.stringify(state));
  record.attemptedMessageIds.forEach(function(messageId) {
    // Exact message IDs only. Do not untrash a whole thread or a new reply.
    // An ID is journalled immediately before our Trash call; ambiguous failed
    // responses are conservatively recovered, never automatically re-trashed.
    var message = Gmail.Users.Messages.get('me', messageId,
      { format: 'minimal', fields: 'id,threadId,labelIds' });
    if (!message || message.id !== messageId || message.threadId !== id || !Array.isArray(message.labelIds))
      throw new Error('RETENTION_RECOVERY_MESSAGE_UNVERIFIED');
    if (message.labelIds.indexOf('TRASH') >= 0) {
      Gmail.Users.Messages.untrash('me', messageId);
      report.restoredFromTrash++;
    }
  });
  // Keep the recovering journal until ALL attempted IDs are verified out of
  // Trash. A partial untrash or Properties failure retries recovery, not Trash.
  record.attemptedMessageIds.forEach(function(messageId) {
    var message = Gmail.Users.Messages.get('me', messageId,
      { format: 'minimal', fields: 'id,threadId,labelIds' });
    if (!message || message.id !== messageId || message.threadId !== id || !Array.isArray(message.labelIds) ||
      message.labelIds.indexOf('TRASH') >= 0) throw new Error('RETENTION_RECOVERY_NOT_CONFIRMED');
  });
  var snapshot = retentionSnapshot_(id, ctx), held = snapshot.flags.hold;
  retentionSetLabels_(id, ctx, ['pending'], ['close', 'closed']);
  var next = retentionRecord_(snapshot, held ? 'held' : 'open', now, record);
  next.pendingAfterCloseSeen = true;
  next.requiresNewClose = true;
  ctx.properties.setProperty(key, JSON.stringify(next));
  report.manualReviewRequired = true;
}

function retentionRecord_(snapshot, phase, now, previous) {
  return { v: 1, threadId: snapshot.id, phase: phase, observedAt: now,
    closedAt: phase === 'closed' ? now : null, fingerprint: snapshot.fingerprint,
    messageCount: snapshot.messages.length, lastMessageAt: snapshot.lastMessageAt,
    pendingAfterCloseSeen: ['open', 'reopening'].indexOf(phase) >= 0 && !!(previous &&
      (previous.phase === 'closed' || previous.phase === 'reopening' || previous.pendingAfterCloseSeen)) };
}

function retentionSetLabels_(id, ctx, add, remove) {
  Gmail.Users.Threads.modify({
    addLabelIds: add.map(function(key) { return ctx.labels[key]; }),
    removeLabelIds: remove.map(function(key) { return ctx.labels[key]; })
  }, 'me', id);
}

function runRetention_(forceAudit) {
  var started = Date.now(), ctx = retentionContext_(), audit = forceAudit || !ctx.active;
  var report = { accountVerified: true, mode: audit ? 'AUDIT_ONLY' : 'ACTIVE', examined: 0,
    planned: {}, errors: 0, limitExceeded: false, stoppedForBudget: false, movedToTrash: 0,
    restoredFromTrash: 0, manualReviewRequired: false };
  if (ctx.missing.length) { report.missingLabels = ctx.missing.length; report.manualReviewRequired = true; return report; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { report.busy = true; return report; }
  try {
    var properties = ctx.properties.getProperties(), records = {}, ids = {};
    Object.keys(properties).filter(function(key) { return key.indexOf(RETENTION.prefix) === 0; }).forEach(function(key) {
      var id = key.slice(RETENTION.prefix.length);
      if (!/^[a-f0-9]+$/i.test(id)) throw new Error('RETENTION_INVALID_RECORD_KEY');
      try { records[id] = JSON.parse(properties[key]); } catch (_) { records[id] = { v: 0 }; }
      ids[id] = true;
    });
    // All opt-in labels, not a date search, inbox scan, archive or subject match.
    Object.keys(ctx.labels).forEach(function(key) {
      var result = Gmail.Users.Threads.list('me', { labelIds: [ctx.labels[key]], includeSpamTrash: false,
        maxResults: RETENTION.maxThreads + 1, fields: 'threads(id),nextPageToken,resultSizeEstimate' });
      // Ask for a field present on empty results instead of treating an
      // unverified null/undefined response as an empty mailbox. Estimates are
      // not exact counts and never replace pagination or the unique-ID cap.
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
        (result.threads !== undefined && !Array.isArray(result.threads)) ||
        (result.threads === undefined && result.resultSizeEstimate !== 0) ||
        (result.resultSizeEstimate !== undefined && (!Number.isSafeInteger(result.resultSizeEstimate) ||
          result.resultSizeEstimate < 0)) ||
        (result.nextPageToken != null && typeof result.nextPageToken !== 'string')) {
        report.limitExceeded = true; report.listResponseInvalid = true; return;
      }
      if (result.nextPageToken) report.limitExceeded = true;
      (result.threads || []).forEach(function(thread) {
        if (!/^[a-f0-9]+$/i.test(String(thread.id || ''))) throw new Error('RETENTION_INVALID_THREAD_ID');
        ids[thread.id] = true;
      });
    });
    if (Object.keys(ids).length > RETENTION.maxThreads) report.limitExceeded = true;
    if (report.limitExceeded) { report.manualReviewRequired = true; return report; } // No partial first-page processing.
    var trashBudget = RETENTION.maxTrashMessages;
    Object.keys(ids).sort().some(function(id) {
      if (Date.now() - started > RETENTION.maxMillis) { report.stoppedForBudget = true; return true; }
      var propertyKey = RETENTION.prefix + id, record = records[id];
      // This removes only metadata we created after a successful Trash action;
      // it neither permanently deletes mail nor interprets provider retention.
      if (record && record.phase === 'trashed' && Number.isSafeInteger(record.trashedAt) &&
        Date.now() - record.trashedAt >= RETENTION.metadataDaysAfterTrash * 86400000) {
        report.planned.retireMetadata = (report.planned.retireMetadata || 0) + 1;
        if (!audit) ctx.properties.deleteProperty(propertyKey);
        return false;
      }
      var mutationRecord = null;
      try {
        var now = Date.now(), snapshot = retentionSnapshot_(id, ctx), plan = retentionPlan_(snapshot, record, now);
        report.examined++;
        report.planned[plan.action] = (report.planned[plan.action] || 0) + 1;
        if (plan.reason === 'invalid_managed_ids_manual_review') report.manualReviewRequired = true;
        if (audit || ['wait', 'skip'].indexOf(plan.action) >= 0) return false;
        if (plan.action === 'recover') {
          retentionRecover_(id, ctx, record, report, now);
        } else if (plan.action === 'hold') {
          ctx.properties.setProperty(propertyKey, JSON.stringify(retentionRecord_(snapshot, 'held', now, record)));
        } else if (plan.action === 'forget') {
          if (record) ctx.properties.deleteProperty(propertyKey);
        } else if (plan.action === 'reopen') {
          // Record the first observed Pending/reply after closure before labels
          // are normalised; next run cannot accidentally reuse that close time.
          ctx.properties.setProperty(propertyKey, JSON.stringify(retentionRecord_(snapshot, 'reopening', now, record)));
          retentionSetLabels_(id, ctx, ['pending'], ['close', 'closed']);
          ctx.properties.setProperty(propertyKey, JSON.stringify(retentionRecord_(snapshot, 'open', now, record)));
        } else if (plan.action === 'close') {
          ctx.properties.setProperty(propertyKey, JSON.stringify(retentionRecord_(snapshot, 'closed', now, record)));
          retentionSetLabels_(id, ctx, ['closed'], ['close', 'pending']);
        } else if (plan.action === 'trash') {
          if (snapshot.messages.length > trashBudget) { report.stoppedForBudget = true; return false; }
          var before = retentionSnapshot_(id, ctx);
          if (retentionPlan_(before, record, Date.now()).action !== 'trash' || before.fingerprint !== snapshot.fingerprint)
            throw new Error('RETENTION_RECHECK_CHANGED');
          // First snapshot contained NO Trash. Save the exact allowlist before
          // beginning; then journal each attempted ID before crossing the API.
          mutationRecord = Object.assign({}, record, { phase: 'trashing', observedAt: now,
            managedMessageIds: snapshot.messages.map(function(message) { return message.id; }), attemptedMessageIds: [] });
          ctx.properties.setProperty(propertyKey, JSON.stringify(mutationRecord));
          snapshot.messages.forEach(function(message) {
            // No thread-wide Trash: a newly arrived reply can never be swept
            // in by this operation. Gmail has no atomic compare-and-trash;
            // recheck hold/reply/classification immediately before EACH ID.
            var current = retentionSnapshot_(id, ctx);
            if (current.fingerprint !== snapshot.fingerprint || current.flags.hold || current.flags.pending ||
              current.flags.close || !current.allClosed || current.unknown || current.draft || current.spam)
              throw new Error('RETENTION_RECHECK_CHANGED');
            var currentMessage = current.messages.filter(function(item) { return item.id === message.id; })[0];
            if (!currentMessage || currentMessage.labels.indexOf('TRASH') >= 0)
              throw new Error('RETENTION_ALREADY_MANUALLY_TRASHED');
            mutationRecord.attemptedMessageIds.push(message.id);
            ctx.properties.setProperty(propertyKey, JSON.stringify(mutationRecord));
            Gmail.Users.Messages.trash('me', message.id);
            report.movedToTrash++; trashBudget--;
          });
          var after = retentionSnapshot_(id, ctx);
          if (after.fingerprint !== snapshot.fingerprint || after.flags.hold || after.flags.pending ||
            after.flags.close || !after.allClosed || after.unknown || after.draft || after.spam)
            throw new Error('RETENTION_FINAL_RECHECK_CHANGED');
          ctx.properties.setProperty(propertyKey, JSON.stringify(Object.assign({}, mutationRecord,
            { phase: 'trashed', observedAt: now, trashedAt: Date.now() })));
        }
      } catch (_) {
        report.errors++; // Never log provider bodies, subjects, addresses or exceptions.
        if (mutationRecord) {
          report.manualReviewRequired = true;
          try { retentionRecover_(id, ctx, mutationRecord, report, Date.now()); } catch (_) { report.errors++; }
        }
      }
      return false;
    });
    return report;
  } finally { lock.releaseLock(); }
}
