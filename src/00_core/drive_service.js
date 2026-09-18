var DocumentalistasDrive = (function () {
  'use strict';

  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  var DOC_MIME = 'application/vnd.google-apps.document';
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function getFile(fileId, fields) {
    try {
      return Drive.Files.get(fileId, {
        supportsAllDrives: true,
        fields: fields || 'id,name,mimeType,parents,driveId,trashed,properties,appProperties,capabilities'
      });
    } catch (error) {
      DocumentalistasErrors.fail('RESOURCE_INACCESSIBLE', 'Recurso do Drive inexistente ou inacessível.', { fileId: fileId, cause: error.message });
    }
  }

  function driveContext(rootId) {
    var root = getFile(rootId);
    if (root.mimeType !== FOLDER_MIME || root.trashed) {
      DocumentalistasErrors.fail('INVALID_ROOT_FOLDER', 'ROOT_FOLDER_ID não aponta para uma pasta ativa.', { rootId: rootId });
    }
    if (!root.capabilities || !root.capabilities.canAddChildren) {
      DocumentalistasErrors.fail('ROOT_PERMISSION_DENIED', 'A conta executora não pode criar itens na pasta raiz.', { rootId: rootId });
    }
    return { root: root, driveId: root.driveId || null };
  }

  function escapeQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function listFiles(query, context, fields) {
    var files = [];
    var pageToken;
    do {
      var options = {
        q: query,
        spaces: 'drive',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'nextPageToken,files(' + (fields || 'id,name,mimeType,parents,driveId,trashed,properties,appProperties') + ')'
      };
      if (pageToken) options.pageToken = pageToken;
      if (context && context.driveId) {
        options.corpora = 'drive';
        options.driveId = context.driveId;
      }
      var result = Drive.Files.list(options);
      files = files.concat(result.files || []);
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }

  function directChildren(parentId, context, filters) {
    filters = filters || {};
    var query = "'" + escapeQuery(parentId) + "' in parents and trashed = false";
    if (filters.mimeType) query += " and mimeType = '" + escapeQuery(filters.mimeType) + "'";
    if (filters.name) query += " and name = '" + escapeQuery(filters.name) + "'";
    Object.keys(filters.appProperties || {}).forEach(function (key) {
      query += " and properties has { key='" + escapeQuery(key) + "' and value='" + escapeQuery(filters.appProperties[key]) + "' }";
    });
    return listFiles(query, context);
  }

  function selectUnique(candidates, conflictCode, description) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length > 1) {
      DocumentalistasErrors.fail(conflictCode || 'MULTIPLE_CANDIDATES', 'Mais de um recurso corresponde a ' + description + '; seleção automática bloqueada.', {
        candidateIds: candidates.map(function (item) { return item.id; })
      });
    }
    return candidates[0];
  }

  function mergeAppProperties(fileId, newProperties) {
    var current = getFile(fileId, 'id,properties,appProperties');
    var merged = Object.assign({}, current.properties || current.appProperties || {}, newProperties || {});
    Drive.Files.update({ properties: merged, appProperties: merged }, fileId, null, { supportsAllDrives: true });
    return merged;
  }

  function createFolder(parentId, name, appProperties) {
    return Drive.Files.create({
      name: name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
      properties: appProperties || {},
      appProperties: appProperties || {}
    }, null, { supportsAllDrives: true, fields: 'id,name,mimeType,parents,driveId,properties,appProperties' });
  }

  function ensureTechnicalFolder(config, context) {
    if (config.TECHNICAL_FOLDER_ID) {
      var configured = getFile(config.TECHNICAL_FOLDER_ID);
      if ((configured.parents || []).indexOf(config.ROOT_FOLDER_ID) >= 0 && configured.mimeType === FOLDER_MIME && !configured.trashed) return configured;
      DocumentalistasErrors.fail('INVALID_TECHNICAL_FOLDER', 'TECHNICAL_FOLDER_ID não é uma pasta filha direta da raiz configurada.');
    }
    var found = selectUnique(directChildren(config.ROOT_FOLDER_ID, context, {
      mimeType: FOLDER_MIME,
      appProperties: { sl_kind: 'documentalistas_technical_root' }
    }), 'TECHNICAL_FOLDER_CONFLICT', 'pasta técnica da automação');
    if (!found) {
      found = selectUnique(directChildren(config.ROOT_FOLDER_ID, context, {
        mimeType: FOLDER_MIME,
        name: config.TECHNICAL_FOLDER_NAME
      }), 'TECHNICAL_FOLDER_CONFLICT', 'pasta técnica legada da automação');
      if (found) mergeAppProperties(found.id, { sl_kind: 'documentalistas_technical_root' });
    }
    if (!found) found = createFolder(config.ROOT_FOLDER_ID, config.TECHNICAL_FOLDER_NAME, { sl_kind: 'documentalistas_technical_root' });
    DocumentalistasConfig.setNonDestructive({ TECHNICAL_FOLDER_ID: found.id });
    verifyParent(found.id, config.ROOT_FOLDER_ID);
    return found;
  }

  function renderName(pattern, identity) {
    return String(pattern)
      .split('{{nomeCompletoDocumentalista}}').join(identity.displayName)
      .split('{{cpfCnpjDocumentalista}}').join(identity.formattedDocument);
  }

  function ensureProfessionalFolder(input, config, context) {
    var identityKey = input.identityKey;
    var name = renderName(config.FOLDER_NAME_PATTERN, input.identity);
    var metadata = {
      sl_kind: 'documentalista_folder',
      sl_identity: identityKey,
      sl_document_type: input.identity.documentType,
      sl_document_hash: DocumentalistasNormalize.sha256(input.identity.canonicalDocument)
    };
    var found = selectUnique(directChildren(config.ROOT_FOLDER_ID, context, {
      mimeType: FOLDER_MIME,
      appProperties: { sl_kind: 'documentalista_folder', sl_identity: identityKey }
    }), 'FOLDER_CONFLICT', 'pasta identificada do documentalista');
    if (!found) {
      found = selectUnique(directChildren(config.ROOT_FOLDER_ID, context, { mimeType: FOLDER_MIME, name: name }), 'FOLDER_CONFLICT', 'pasta legada pelo nome e documento');
      if (found) mergeAppProperties(found.id, metadata);
    }
    if (!found) {
      try {
        found = createFolder(config.ROOT_FOLDER_ID, name, metadata);
      } catch (error) {
        found = selectUnique(directChildren(config.ROOT_FOLDER_ID, context, {
          mimeType: FOLDER_MIME,
          appProperties: { sl_kind: 'documentalista_folder', sl_identity: identityKey }
        }), 'FOLDER_CONFLICT', 'pasta criada com resultado incerto');
        if (!found) throw error;
      }
    }
    if (found.name !== name) {
      found = Drive.Files.update({ name: name }, found.id, null, {
        supportsAllDrives: true,
        fields: 'id,name,mimeType,parents,driveId,properties,appProperties'
      });
    }
    verifyParent(found.id, config.ROOT_FOLDER_ID);
    return found;
  }

  function copyFile(sourceId, name, parentId, appProperties) {
    return Drive.Files.copy({ name: name, parents: [parentId], properties: appProperties || {}, appProperties: appProperties || {} }, sourceId, {
      supportsAllDrives: true,
      fields: 'id,name,mimeType,parents,driveId,properties,appProperties'
    });
  }

  function verifyParent(fileId, expectedParentId) {
    var file = getFile(fileId, 'id,name,parents,trashed,mimeType');
    if (file.trashed || (file.parents || []).indexOf(expectedParentId) < 0) {
      DocumentalistasErrors.fail('WRONG_DRIVE_PARENT', 'O recurso não foi criado na pasta esperada; nenhum fallback foi aceito.', { fileId: fileId, expectedParentId: expectedParentId });
    }
    return file;
  }

  function trashOwnedIntermediate(fileId, identityKey) {
    var file = getFile(fileId, 'id,trashed,properties,appProperties');
    if (file.trashed) return;
    var metadata = file.properties || file.appProperties || {};
    if (metadata.sl_kind !== 'contract_intermediate' || metadata.sl_identity !== identityKey) {
      DocumentalistasErrors.fail('UNSAFE_INTERMEDIATE_CLEANUP', 'Limpeza bloqueada: o arquivo não possui metadados da automação.', { fileId: fileId });
    }
    Drive.Files.update({ trashed: true }, fileId, null, { supportsAllDrives: true });
  }

  function trashOwnedContract(fileId, identityKey, folderId) {
    var file = getFile(fileId, 'id,name,mimeType,parents,trashed,properties,appProperties');
    var metadata = file.properties || file.appProperties || {};
    if (file.trashed) return { id: file.id, name: file.name, alreadyTrashed: true };
    if (file.mimeType !== DOCX_MIME || (file.parents || []).indexOf(folderId) < 0 ||
        metadata.sl_kind !== 'documentalista_contract' || metadata.sl_identity !== identityKey) {
      DocumentalistasErrors.fail('UNSAFE_CONTRACT_CLEANUP', 'Regeneração bloqueada: o contrato não possui identidade, tipo e parent esperados da automação.', { fileId: fileId, folderId: folderId });
    }
    Drive.Files.update({ trashed: true }, file.id, null, { supportsAllDrives: true });
    return { id: file.id, name: file.name, alreadyTrashed: false };
  }

  function trashProfessionalFolder(folderId, identityKey, rootId) {
    var folder = getFile(folderId, 'id,name,mimeType,parents,trashed,properties,appProperties');
    var metadata = folder.properties || folder.appProperties || {};
    if (folder.trashed) return { id: folder.id, name: folder.name, alreadyTrashed: true };
    if (folder.mimeType !== FOLDER_MIME || (folder.parents || []).indexOf(rootId) < 0 ||
        metadata.sl_kind !== 'documentalista_folder' || metadata.sl_identity !== identityKey) {
      DocumentalistasErrors.fail('UNSAFE_PROFESSIONAL_FOLDER_CLEANUP', 'Remoção bloqueada: a pasta não possui identidade e parent esperados da automação.', { folderId: folderId });
    }
    Drive.Files.update({ trashed: true }, folder.id, null, { supportsAllDrives: true });
    return { id: folder.id, name: folder.name, alreadyTrashed: false };
  }

  return {
    FOLDER_MIME: FOLDER_MIME,
    SHEET_MIME: SHEET_MIME,
    DOC_MIME: DOC_MIME,
    DOCX_MIME: DOCX_MIME,
    getFile: getFile,
    driveContext: driveContext,
    listFiles: listFiles,
    directChildren: directChildren,
    selectUnique: selectUnique,
    mergeAppProperties: mergeAppProperties,
    createFolder: createFolder,
    ensureTechnicalFolder: ensureTechnicalFolder,
    ensureProfessionalFolder: ensureProfessionalFolder,
    renderName: renderName,
    copyFile: copyFile,
    verifyParent: verifyParent,
    trashOwnedIntermediate: trashOwnedIntermediate,
    trashOwnedContract: trashOwnedContract,
    trashProfessionalFolder: trashProfessionalFolder
  };
})();
