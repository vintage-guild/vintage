-- Tables.lua
-- Pure table utilities - no WoW dependencies

local FenCore = _G.FenCore
local Catalog = FenCore.Catalog

local Tables = {}

--- Perform a deep copy of a table.
--- Recursively copies all nested tables and preserves metatables.
---@param original table The table to copy
---@return table copy A new table with copied contents
function Tables.DeepCopy(original)
    local originalType = type(original)
    local copy
    if originalType == "table" then
        copy = {}
        for key, value in next, original, nil do
            copy[Tables.DeepCopy(key)] = Tables.DeepCopy(value)
        end
        setmetatable(copy, Tables.DeepCopy(getmetatable(original)))
    else
        copy = original
    end
    return copy
end

--- Shallow merge of source into target.
--- Overwrites existing keys in target with values from source.
---@param target table Target table (modified in place)
---@param source table Source table to merge from
---@return table target The modified target table
function Tables.Merge(target, source)
    if type(source) ~= "table" then return target end
    for key, value in pairs(source) do
        target[key] = value
    end
    return target
end

--- Deep merge of source into target.
--- Recursively merges nested tables instead of overwriting.
---@param target table Target table (modified in place)
---@param source table Source table to merge from
---@return table target The modified target table
function Tables.DeepMerge(target, source)
    if type(source) ~= "table" then return target end
    for key, value in pairs(source) do
        if type(value) == "table" and type(target[key]) == "table" then
            Tables.DeepMerge(target[key], value)
        else
            target[key] = Tables.DeepCopy(value)
        end
    end
    return target
end

--- Get all keys from a table.
---@param tbl table The table to extract keys from
---@return table keys Array of keys
function Tables.Keys(tbl)
    local keys = {}
    if type(tbl) == "table" then
        for key in pairs(tbl) do
            keys[#keys + 1] = key
        end
    end
    return keys
end

--- Get all values from a table.
---@param tbl table The table to extract values from
---@return table values Array of values
function Tables.Values(tbl)
    local values = {}
    if type(tbl) == "table" then
        for _, value in pairs(tbl) do
            values[#values + 1] = value
        end
    end
    return values
end

--- Count entries in a table (works with non-array tables).
---@param tbl table The table to count
---@return number count Number of key-value pairs
function Tables.Count(tbl)
    local count = 0
    if type(tbl) == "table" then
        for _ in pairs(tbl) do
            count = count + 1
        end
    end
    return count
end

--- Check if a table is empty.
---@param tbl table The table to check
---@return boolean isEmpty True if table has no entries
function Tables.IsEmpty(tbl)
    if type(tbl) ~= "table" then return true end
    return next(tbl) == nil
end

--- Check if a table contains a specific value.
---@param tbl table The table to search
---@param value any The value to find
---@return boolean contains True if value exists in table
function Tables.Contains(tbl, value)
    if type(tbl) ~= "table" then return false end
    for _, v in pairs(tbl) do
        if v == value then return true end
    end
    return false
end

--- Find the key for a given value in a table.
---@param tbl table The table to search
---@param value any The value to find
---@return any|nil key The key if found, nil otherwise
function Tables.KeyOf(tbl, value)
    if type(tbl) ~= "table" then return nil end
    for key, v in pairs(tbl) do
        if v == value then return key end
    end
    return nil
end

--- Filter a table by a predicate function.
---@param tbl table The table to filter
---@param predicate function Function(value, key) returning boolean
---@return table filtered New table with matching entries
function Tables.Filter(tbl, predicate)
    local result = {}
    if type(tbl) ~= "table" then return result end
    for key, value in pairs(tbl) do
        if predicate(value, key) then
            result[key] = value
        end
    end
    return result
end

--- Map a function over table values.
---@param tbl table The table to map over
---@param transform function Function(value, key) returning new value
---@return table mapped New table with transformed values
function Tables.Map(tbl, transform)
    local result = {}
    if type(tbl) ~= "table" then return result end
    for key, value in pairs(tbl) do
        result[key] = transform(value, key)
    end
    return result
end

-- Register with catalog
Catalog:RegisterDomain("Tables", {
    DeepCopy = {
        handler = Tables.DeepCopy,
        description = "Create a deep copy of a table",
        params = {
            { name = "original", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "local copy = Tables.DeepCopy(original)",
    },
    Merge = {
        handler = Tables.Merge,
        description = "Shallow merge source into target",
        params = {
            { name = "target", type = "table", required = true },
            { name = "source", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "Tables.Merge(defaults, userSettings)",
    },
    DeepMerge = {
        handler = Tables.DeepMerge,
        description = "Deep merge source into target (recursive)",
        params = {
            { name = "target", type = "table", required = true },
            { name = "source", type = "table", required = true },
        },
        returns = { type = "table" },
    },
    Keys = {
        handler = Tables.Keys,
        description = "Get all keys from a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "table" },
        example = 'Tables.Keys({a=1, b=2}) -> {"a", "b"}',
    },
    Values = {
        handler = Tables.Values,
        description = "Get all values from a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "Tables.Values({a=1, b=2}) -> {1, 2}",
    },
    Count = {
        handler = Tables.Count,
        description = "Count entries in a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "number" },
        example = "Tables.Count({a=1, b=2}) -> 2",
    },
    IsEmpty = {
        handler = Tables.IsEmpty,
        description = "Check if a table is empty",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "boolean" },
    },
    Contains = {
        handler = Tables.Contains,
        description = "Check if table contains a value",
        params = {
            { name = "tbl", type = "table", required = true },
            { name = "value", type = "any", required = true },
        },
        returns = { type = "boolean" },
    },
    KeyOf = {
        handler = Tables.KeyOf,
        description = "Find the key for a given value",
        params = {
            { name = "tbl", type = "table", required = true },
            { name = "value", type = "any", required = true },
        },
        returns = { type = "any|nil" },
        example = 'Tables.KeyOf({a=1, b=2}, 2) -> "b"',
    },
    Filter = {
        handler = Tables.Filter,
        description = "Filter table by predicate function",
        params = {
            { name = "tbl", type = "table", required = true },
            { name = "predicate", type = "function", required = true, description = "function(value, key) -> boolean" },
        },
        returns = { type = "table" },
    },
    Map = {
        handler = Tables.Map,
        description = "Transform table values with a function",
        params = {
            { name = "tbl", type = "table", required = true },
            { name = "transform", type = "function", required = true, description = "function(value, key) -> newValue" },
        },
        returns = { type = "table" },
    },
})

FenCore.Tables = Tables
return Tables
