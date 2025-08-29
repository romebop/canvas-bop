import React, { useState } from 'react';
import styled from 'styled-components';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  max-width: 768px;
  margin: 0 auto;
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
`;

const MessageList = styled.div`
  flex-grow: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Message = styled.div<{ from: 'system' | 'user' | 'assistant' | 'assistant_temp' }>`
  align-self: ${props => (props.from === 'user' ? 'flex-end' : 'flex-start')};
  background-color: ${props => (props.from === 'user' ? '#007bff' : '#f1f1f1')};
  color: ${props => (props.from === 'user' ? 'white' : 'black')};
  padding: 10px 15px;
  border-radius: 18px;
  max-width: 70%;
  word-wrap: break-word;
`;

const InputArea = styled.form`
  display: flex;
  padding: 10px;
  border-top: 1px solid #ccc;
`;

const TextInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-right: 10px;
  font-size: 16px;
`;

const SendButton = styled.button`
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;

  &:hover {
    background-color: #0056b3;
  }
`;

type MessageType = {
  role: 'system' | 'user' | 'assistant' | 'assistant_temp';
  content: string;
};

export default function Test() {

  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: MessageType = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const payload = {
      model: 'Qwen/Qwen2.5-Coder-32B-Instruct-GGUF:Q8_0',
      messages: [...messages, userMessage], // include chat history
      max_tokens: 150,
      stream: true,
    };

    try {
      const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';

      while (true) {

        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const payload = line.replace(/^data: /, '');
          if (payload === '[DONE]') continue;

          const parsed = JSON.parse(payload);
          const content = parsed.choices[0].delta.content;
          if (content) {
            assistantText += content;
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'assistant_temp'),
              { role: 'assistant_temp', content: assistantText }
            ]);
          }
          if (parsed.choices[0].finish_reason === 'stop') {
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'assistant_temp'),
              { role: 'assistant', content: assistantText }
            ]);
          }
        }
      }

      const data = await response.json();
      const botMessage: MessageType = { content: data.content, role: 'assistant' };
      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error('Error fetching completion:', error);
      const errorMessage: MessageType = { content: 'Error fetching response from the model.', role: 'assistant' };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <ChatContainer>
      <MessageList>
        {messages.map((msg, index) => (
          <Message key={index} from={msg.role}>
            {msg.content}
          </Message>
        ))}
      </MessageList>
      <InputArea onSubmit={handleSend}>
        <TextInput
          type='text'
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder='Type your message...'
        />
        <SendButton type='submit'>Send</SendButton>
      </InputArea>
    </ChatContainer>
  );
}