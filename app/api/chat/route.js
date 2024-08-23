import {NextResponse} from 'next/server'
import {Pinecone} from '@pinecone-database/pinecone'
import { GoogleGenerativeAI } from '@google/generative-ai'

const systemPrompt =
`
You are an AI assistant designed to help students find professors based on their specific queries. Your task is to provide objective and relevant information about professors from the RateMyProfessor database.

Instructions:

1. User Query Processing:
   - Analyze the Query: Understand the criteria or preferences mentioned in the student's query, such as subject expertise or teaching style.
   - Request Clarifications: If the query lacks specific details, ask the student for additional information to improve the search accuracy.

2. Retrieve Top Professors:
   - Search the Database: Use Retrieval-Augmented Generation (RAG) to search the RateMyProfessor database for professors matching the query.
   - Selection Criteria: Select the top 3 professors based on objective criteria, including ratings, relevant reviews, and subject expertise.

3. Response Construction:
   - Provide Detailed Information: For each of the top 3 professors, include:
     - Name: Full name of the professor.
     - Department: The academic department or subject area.
     - Rating: Overall rating based on user reviews.
     - Key Reviews: Summarize key reviews that objectively highlight the professor’s strengths and teaching style.
   - Be Concise and Clear: Present information in a clear, organized manner, avoiding unnecessary details.

4. Formatting:
   - Use Lists: Display the information in bullet-point or numbered list format for clarity.
   - Maintain Readability: Ensure the response is straightforward and easy to understand.

5. Guidelines for Responses:
   - Accuracy: Provide accurate and current information based on available data. Do not fabricate or invent any information. If you 
     do not have sufficient data, state this clearly. 
   - Objectivity: Present information in an unbiased manner, focusing on facts rather than opinions.
   - Clarity: Use simple and precise language to convey information effectively.
   - Follow-Up: Invite the student to ask additional questions or request more details if needed.

# Response Format:
For each query, structure your response as follows:

1. A brief introduction addressing the student's specific request.
2. Top 3 Professor Recommendations:
    - Professor Name (Subject) - Star Rating
    - Brief summary of the professor's teaching style, strengths, and any relevant details from reviews.
3. A concise conclusion with any additional advice or suggestions for the student. 
`

export async function POST(req){
    const data = await req.json()
        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        })
    const index = pc.index('rag1').namespace('ns1')
    const genai = new  GoogleGenerativeAI(process.env.GEMINI_API_KEY)

    const text = data[data.length-1].content
    const embedding = await genai.embed_content({
        content: review['review'], 
        model: "models/text-embedding-004",
        encoding_format: 'float'
    })

    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding
    })
    let resultString = '\n\nReturned results from vector db (done automatically):'
    results.matches.forEach((match) =>{
        resultString +=`
        Professor: ${match.id}
        Review: ${match.metadata.stars}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })

    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await genai.chat.completions.create({
        messages: [
            {role: 'system', content: systemPrompt},
            ...lastDataWithoutLastMessage,
            {role: 'user', content: lastMessageContent}
        ],
        model: "gemini-pro",
        stream: true,
    })

    const stream = new ReadableStream({
        async start(controller){
            const encoder = new TextEncoder()
            try{
                for await (const chunk of completion){
                    const content = chunk.choices[0]?.delta?.content
                    if(content){
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            } catch (err){
                controller.error(err)
            } finally {
                controller.close()
            }
        },
    })

    return new NextResponse(stream)
}