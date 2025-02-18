import { encode } from "gpt-token-utils";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import { OpenAIExt } from "openai-ext";
import { db } from "../db";
import { config } from "./config";

function getClient(
  apiKey: string,
  apiType: string,
  apiAuth: string,
  basePath: string
) {
  let configuration = new Configuration({
    ...((apiType === "openai" ||
      (apiType === "custom" && apiAuth === "bearer-token")) && {
      apiKey: apiKey,
    }),
    ...(apiType === "custom" && { basePath: basePath }),
  });
  delete configuration.baseOptions.headers['User-Agent'];
  return new OpenAIApi(configuration);
}

export async function createStreamChatCompletion(
  apiKey: string,
  messages: ChatCompletionRequestMessage[],
  chatId: string,
  messageId: string
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;
  const chatCompletionsUrl = settings?.openAiApiBase ? settings?.openAiApiBase + "/chat/completions" : undefined;

  return OpenAIExt.streamClientChatCompletion(
    {
      model,
      messages,
      max_tokens: 256,
    },
    {
      apiKey: apiKey,
      chatCompletionsUrl: chatCompletionsUrl,
      handler: {
        onContent(content, isFinal, stream) {
          console.log(content, "isFinal?", isFinal);
          setStreamContent(messageId, content, isFinal);
          if (isFinal) {
            setTotalTokens(chatId, content);
          }
        },
        onDone(stream) {
          console.log('Done!');
        },
        onError(error, status, stream) {
          //console.error(error, status);
        },
      },
    }
  );
}

function setStreamContent(
  messageId: string,
  content: string,
  isFinal: boolean
) {
  content = isFinal ? content : content + "█";
  db.messages.update(messageId, { content: content });
}

function setTotalTokens(chatId: string, content: string) {
  let total_tokens = encode(content).length;
  db.chats.where({ id: chatId }).modify((chat) => {
    if (chat.totalTokens) {
      chat.totalTokens += total_tokens;
    } else {
      chat.totalTokens = total_tokens;
    }
  });
}

export async function createChatCompletion(
  apiKey: string,
  messages: ChatCompletionRequestMessage[]
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;
  const type = settings?.openAiApiType ?? config.defaultType;
  const auth = settings?.openAiApiAuth ?? config.defaultAuth;
  const base = settings?.openAiApiBase ?? config.defaultBase;
  const version = settings?.openAiApiVersion ?? config.defaultVersion;

  const client = getClient(apiKey, type, auth, base);
  return client.createChatCompletion(
    {
      model,
      stream: false,
      messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(type === "custom" && auth === "api-key" && { "api-key": apiKey }),
      },
      params: {
        ...(type === "custom" && { "api-version": version }),
      },
    }
  );
}

export async function checkOpenAIKey(apiKey: string) {
  return createChatCompletion(apiKey, [
    {
      role: "user",
      content: "hello",
    },
  ]);
}
