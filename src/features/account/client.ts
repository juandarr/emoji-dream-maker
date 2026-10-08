import { CreationConflict } from "@/features/playground/creation-repository";
export class AccountRequestError extends Error {constructor(public code:string,public status:number){super(code);}}
export async function readResponse<T>(response:Response):Promise<T>{const body=await response.json();if(!response.ok){if(response.status===409&&body.code==="conflict")throw new CreationConflict();throw new AccountRequestError(body.code||"storage",response.status);}return body as T;}
