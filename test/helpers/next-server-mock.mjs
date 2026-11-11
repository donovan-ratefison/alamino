export async function connection() {}

export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    this.nextUrl = new URL(this.url);
  }
}

export class NextResponse extends Response {
  static json(data, init) {
    return Response.json(data, init);
  }
  static redirect(url, status) {
    return Response.redirect(url, status);
  }
}
