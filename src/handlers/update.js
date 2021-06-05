import {
  getFormData,
  getFormValidation,
  callHooks,
  getParentColumn,
  filterHiddenFields,
  bindTimestampValues,
  serializeData,
} from "./helpers.js";
import Validator from "validatorjs";
import { HOOK_FUNCTIONS, TIMESTAMP_COLUMNS } from "./../Constants.js";
import ApiError from "./../Exceptions/ApiError.js";

export default async (pack) => {
  const { request, response, model, database, relation, parentModel } = pack;

  const query = database.from(model.instance.table);

  // If there is a relation, we should bind it
  if (relation && parentModel) {
    const parentColumn = getParentColumn(relation);
    query.where(relation.foreignKey, request.params[parentColumn]);
  }

  await callHooks(model, HOOK_FUNCTIONS.onBeforeUpdateQuery, {
    ...pack,
    query,
  });

  let item = await query
    .where(model.instance.primaryKey, request.params[model.instance.primaryKey])
    .first();
  if (!item) {
    throw new ApiError(404, `The item is not found on ${model.name}.`);
  }

  await callHooks(model, HOOK_FUNCTIONS.onAfterUpdateQuery, {
    ...pack,
    item,
    query,
  });

  const formData = getFormData(request, model.instance.fillable);

  const formValidationRules = getFormValidation(
    request.method,
    model.instance.validations
  );

  if (formValidationRules) {
    const validation = new Validator(formData, formValidationRules);
    if (validation.fails()) {
      return response.status(400).json(validation.errors);
    }
  }

  // We should bind the timestamp values
  bindTimestampValues(formData, [TIMESTAMP_COLUMNS.UPDATED_AT], model);

  await callHooks(model, HOOK_FUNCTIONS.onBeforeUpdate, {
    ...pack,
    item,
    formData,
    query,
  });

  await query
    .where(model.instance.primaryKey, item[model.instance.primaryKey])
    .update(formData);
  item = await database(model.instance.table)
    .where(model.instance.primaryKey, item[model.instance.primaryKey])
    .first();

  await callHooks(model, HOOK_FUNCTIONS.onAfterUpdate, {
    ...pack,
    item,
    formData,
    query,
  });

  // Serializing the data by the model's serialize method
  item = serializeData(item, model.instance.serialize);

  // Filtering hidden fields from the response data.
  filterHiddenFields([item], model.instance.hiddens);

  return response.json(item);
};